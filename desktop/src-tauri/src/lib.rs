use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use sha2::Digest;
use std::io::Write;
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

fn validate_dictionary_url(input: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(input)
        .map_err(|_| "Indirizzo del dizionario non valido".to_string())?;
    let valid_path = [
        "/it/dizionario/italiano-inglese/",
        "/it/dizionario/inglese-italiano/",
    ]
    .iter()
    .any(|prefix| parsed.path().starts_with(prefix));
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("dictionary.cambridge.org")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some_and(|port| port != 443)
        || !valid_path
    {
        return Err("Indirizzo del dizionario non valido".into());
    }
    Ok(parsed)
}

fn validate_web_result_url(input: &str) -> Result<reqwest::Url, String> {
    let parsed =
        reqwest::Url::parse(input).map_err(|_| "Link della fonte non valido".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let valid_host =
        host == "books.google.com" || host == "it.wikipedia.org" || host == "en.wikipedia.org";
    if parsed.scheme() != "https"
        || !valid_host
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some_and(|port| port != 443)
    {
        return Err("Il link non appartiene a una fonte consentita".into());
    }
    Ok(parsed)
}

#[tauri::command]
fn open_dictionary_url(url: String) -> Result<(), String> {
    let url = validate_dictionary_url(&url)?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(url.as_str());
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(url.as_str());
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(url.as_str());
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Impossibile aprire il browser: {error}"))
}

#[tauri::command]
fn open_spotify_app() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg("spotify:");
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg("spotify:");
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg("spotify:");
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Impossibile aprire Spotify: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SpotifyPlayback {
    title: String,
    artist: String,
    playing: bool,
}

fn block_on<F: std::future::IntoFuture>(future: F) -> F::Output {
    use std::future::Future;
    use std::sync::Arc;
    use std::task::{Context, Poll, Wake, Waker};

    struct ThreadWaker(std::thread::Thread);
    impl Wake for ThreadWaker {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
        fn wake_by_ref(self: &Arc<Self>) {
            self.0.unpark();
        }
    }

    let waker = Waker::from(Arc::new(ThreadWaker(std::thread::current())));
    let mut context = Context::from_waker(&waker);
    let mut future = Box::pin(future.into_future());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(output) => return output,
            Poll::Pending => std::thread::park(),
        }
    }
}

#[tauri::command]
fn get_spotify_playback() -> Result<Option<SpotifyPlayback>, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as SessionManager;

        let manager =
            block_on(SessionManager::RequestAsync().map_err(|error| {
                format!("Impossibile leggere le sessioni multimediali: {error}")
            })?)
            .map_err(|error| format!("Impossibile leggere le sessioni multimediali: {error}"))?;
        let sessions = manager
            .GetSessions()
            .map_err(|error| format!("Impossibile elencare le sessioni multimediali: {error}"))?;

        for index in 0..sessions.Size().unwrap_or(0) {
            let Ok(session) = sessions.GetAt(index) else {
                continue;
            };
            let source = session
                .SourceAppUserModelId()
                .map(|id| id.to_string())
                .unwrap_or_default();
            if !source.to_ascii_lowercase().contains("spotify") {
                continue;
            }

            let media =
                block_on(session.TryGetMediaPropertiesAsync().map_err(|error| {
                    format!("Impossibile leggere i dettagli del brano: {error}")
                })?)
                .map_err(|error| format!("Impossibile leggere i dettagli del brano: {error}"))?;
            let playing = session
                .GetPlaybackInfo()
                .and_then(|info| info.PlaybackStatus())
                .map(|status| {
                    status
                        == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                })
                .unwrap_or(false);

            return Ok(Some(SpotifyPlayback {
                title: media
                    .Title()
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                artist: media
                    .Artist()
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                playing,
            }));
        }

        Ok(None)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn spotify_media_control(action: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as SessionManager;

        let manager = block_on(
            SessionManager::RequestAsync()
                .map_err(|error| format!("Impossibile collegarsi a Spotify: {error}"))?,
        )
        .map_err(|error| format!("Impossibile collegarsi a Spotify: {error}"))?;
        let sessions = manager
            .GetSessions()
            .map_err(|error| format!("Impossibile trovare Spotify: {error}"))?;
        let mut spotify_session = None;
        for index in 0..sessions.Size().unwrap_or(0) {
            let Ok(session) = sessions.GetAt(index) else {
                continue;
            };
            let source = session
                .SourceAppUserModelId()
                .map(|id| id.to_string())
                .unwrap_or_default();
            if source.to_ascii_lowercase().contains("spotify") {
                spotify_session = Some(session);
                break;
            }
        }
        let session = spotify_session.ok_or_else(|| "Spotify non è in esecuzione".to_string())?;
        let operation = match action.as_str() {
            "previous" => session.TrySkipPreviousAsync(),
            "toggle" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            _ => return Err("Comando multimediale non riconosciuto".into()),
        }
        .map_err(|error| format!("Spotify non ha accettato il comando: {error}"))?;
        let result = block_on(operation)
            .map_err(|error| format!("Spotify non ha accettato il comando: {error}"))?;

        if result {
            Ok(())
        } else {
            Err("Spotify non ha accettato il comando".into())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = action;
        Err("I controlli Spotify sono disponibili nella versione Windows".into())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
    source: String,
    price: Option<String>,
}

fn shorten_text(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

const MAX_SEARCH_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

fn append_bounded_chunk(body: &mut Vec<u8>, chunk: &[u8], max_bytes: usize) -> Result<(), String> {
    let next_len = body
        .len()
        .checked_add(chunk.len())
        .ok_or_else(|| "La risposta di ricerca è troppo grande".to_string())?;
    if next_len > max_bytes {
        return Err("La risposta di ricerca è troppo grande".into());
    }
    body.extend_from_slice(chunk);
    Ok(())
}

async fn read_json_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<T, String> {
    let mut response = response
        .error_for_status()
        .map_err(|error| format!("Risposta di ricerca non valida: {error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("La risposta di ricerca è troppo grande".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Lettura della risposta di ricerca non riuscita: {error}"))?
    {
        append_bounded_chunk(&mut body, &chunk, max_bytes)?;
    }
    serde_json::from_slice(&body)
        .map_err(|error| format!("Risposta di ricerca non leggibile: {error}"))
}

#[tauri::command]
async fn search_web(query: String) -> Result<Vec<WebSearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Inserisci una ricerca".into());
    }
    let query = shorten_text(query, 240);
    let client = reqwest::Client::builder()
        .user_agent("Carta Reader/3.0.3 (book research)")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Avvio della ricerca non riuscito: {error}"))?;
    let mut results = Vec::new();

    let mut books_url = reqwest::Url::parse("https://www.googleapis.com/books/v1/volumes")
        .map_err(|error| error.to_string())?;
    books_url
        .query_pairs_mut()
        .append_pair("q", &query)
        .append_pair("maxResults", "5")
        .append_pair("printType", "books")
        .append_pair("country", "IT");
    if let Ok(response) = client.get(books_url).send().await {
        if let Ok(json) =
            read_json_response::<serde_json::Value>(response, MAX_SEARCH_RESPONSE_BYTES).await
        {
            for item in json
                .get("items")
                .and_then(|value| value.as_array())
                .into_iter()
                .flatten()
            {
                let volume = &item["volumeInfo"];
                let title = volume["title"].as_str().unwrap_or("Libro").to_string();
                let authors = volume["authors"]
                    .as_array()
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| item.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    })
                    .unwrap_or_default();
                let description = volume["description"].as_str().unwrap_or("");
                let snippet = shorten_text(
                    &format!(
                        "{}{}",
                        if authors.is_empty() {
                            String::new()
                        } else {
                            format!("Autore: {authors}. ")
                        },
                        description
                    ),
                    900,
                );
                let retail = &item["saleInfo"]["retailPrice"];
                let price = retail["amount"].as_f64().map(|amount| {
                    format!(
                        "Prezzo Google Books: {amount:.2} {}",
                        retail["currencyCode"].as_str().unwrap_or("")
                    )
                });
                let id = item["id"].as_str().unwrap_or("");
                if !id.is_empty() {
                    results.push(WebSearchResult {
                        title,
                        url: format!("https://books.google.com/books?id={id}"),
                        snippet,
                        source: "Google Books".into(),
                        price,
                    });
                }
            }
        }
    }

    for (language, label) in [("it", "Wikipedia"), ("en", "Wikipedia (EN)")] {
        let endpoint = format!("https://{language}.wikipedia.org/w/api.php");
        let Ok(mut wiki_url) = reqwest::Url::parse(&endpoint) else {
            continue;
        };
        wiki_url
            .query_pairs_mut()
            .append_pair("action", "query")
            .append_pair("generator", "search")
            .append_pair("gsrsearch", &query)
            .append_pair("gsrnamespace", "0")
            .append_pair("gsrlimit", "5")
            .append_pair("prop", "extracts")
            .append_pair("exintro", "1")
            .append_pair("explaintext", "1")
            .append_pair("exchars", "750")
            .append_pair("format", "json")
            .append_pair("formatversion", "2");
        let Ok(response) = client.get(wiki_url).send().await else {
            continue;
        };
        let Ok(json) =
            read_json_response::<serde_json::Value>(response, MAX_SEARCH_RESPONSE_BYTES).await
        else {
            continue;
        };
        let pages = json["query"]["pages"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if pages.is_empty() {
            continue;
        }
        for page in pages {
            let title = page["title"]
                .as_str()
                .unwrap_or("Voce Wikipedia")
                .to_string();
            let page_id = page["pageid"].as_u64().unwrap_or(0);
            if page_id == 0 {
                continue;
            }
            results.push(WebSearchResult {
                title,
                url: format!("https://{language}.wikipedia.org/?curid={page_id}"),
                snippet: shorten_text(page["extract"].as_str().unwrap_or(""), 900),
                source: label.into(),
                price: None,
            });
        }
        if results
            .iter()
            .any(|result| result.source.starts_with("Wikipedia"))
        {
            break;
        }
    }

    if results.is_empty() {
        return Err(
            "Nessun risultato da Google Books o Wikipedia. Controlla la connessione e riprova."
                .into(),
        );
    }
    Ok(results)
}

#[tauri::command]
fn open_web_result(url: String) -> Result<(), String> {
    let parsed = validate_web_result_url(&url)?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command
            .arg("url.dll,FileProtocolHandler")
            .arg(parsed.as_str());
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(parsed.as_str());
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(parsed.as_str());
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Impossibile aprire la fonte: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LocalAiState::default())
        .invoke_handler(tauri::generate_handler![
            open_dictionary_url,
            open_spotify_app,
            search_web,
            open_web_result,
            get_spotify_playback,
            spotify_media_control,
            qwen_model_status,
            download_qwen_model,
            ask_qwen
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Carta");
}

#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn dictionary_links_require_the_expected_https_origin_and_path() {
        assert!(validate_dictionary_url(
            "https://dictionary.cambridge.org/it/dizionario/inglese-italiano/reader"
        )
        .is_ok());
        assert!(validate_dictionary_url(
            "https://dictionary.cambridge.org.evil.test/it/dizionario/inglese-italiano/reader"
        )
        .is_err());
        assert!(validate_dictionary_url(
            "https://user@dictionary.cambridge.org/it/dizionario/inglese-italiano/reader"
        )
        .is_err());
        assert!(validate_dictionary_url(
            "https://dictionary.cambridge.org:444/it/dizionario/inglese-italiano/reader"
        )
        .is_err());
        assert!(validate_dictionary_url(
            "https://dictionary.cambridge.org/it/dizionario/inglese-italiano.evil/reader"
        )
        .is_err());
    }

    #[test]
    fn research_links_reject_credentials_non_https_and_nonstandard_ports() {
        assert!(validate_web_result_url("https://books.google.com/books?id=abc").is_ok());
        assert!(validate_web_result_url("http://books.google.com/books?id=abc").is_err());
        assert!(validate_web_result_url("https://books.google.com.evil.test/").is_err());
        assert!(validate_web_result_url("https://user@books.google.com/").is_err());
        assert!(validate_web_result_url("https://books.google.com:444/").is_err());
    }

    #[test]
    fn bounded_response_builder_never_exceeds_its_limit() {
        let mut body = vec![1, 2];
        assert!(append_bounded_chunk(&mut body, &[3, 4], 4).is_ok());
        assert_eq!(body, vec![1, 2, 3, 4]);
        assert!(append_bounded_chunk(&mut body, &[5], 4).is_err());
        assert_eq!(body, vec![1, 2, 3, 4]);
    }

    #[test]
    fn model_download_is_capped() {
        assert_eq!(
            next_model_download_size(MAX_MODEL_DOWNLOAD_BYTES - 1, 1).unwrap(),
            MAX_MODEL_DOWNLOAD_BYTES
        );
        assert!(next_model_download_size(MAX_MODEL_DOWNLOAD_BYTES, 1).is_err());
        assert!(next_model_download_size(u64::MAX, 1).is_err());
    }
}
const QWEN_MODEL_URL: &str = "https://huggingface.co/gguf/Qwen3.5-2B-GGUF/resolve/47f5192dcee31b32db0ba0acc04cccef89cb4b2c/qwen3.5-2b-Q4_K_M.gguf?download=true";
const QWEN_MODEL_FILE: &str = "qwen3.5-2b-Q4_K_M.gguf";
const QWEN_MODEL_SHA256: &str = "9a3d0aa6c920f096441139b6a254542da855223fdad06855ea00c6c087fd713d";
const MIN_MODEL_DOWNLOAD_BYTES: u64 = 500_000_000;
const MAX_MODEL_DOWNLOAD_BYTES: u64 = 2_000_000_000;

fn next_model_download_size(downloaded: u64, chunk_len: usize) -> Result<u64, String> {
    let next = downloaded
        .checked_add(chunk_len as u64)
        .ok_or_else(|| "Il download del modello è troppo grande".to_string())?;
    if next > MAX_MODEL_DOWNLOAD_BYTES {
        return Err("Il download del modello supera il limite di 2 GB".into());
    }
    Ok(next)
}

struct LocalAiEngine {
    model: LlamaModel,
    backend: LlamaBackend,
}
#[derive(Default)]
struct LocalAiState(Arc<Mutex<Option<LocalAiEngine>>>);

fn model_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    Ok(dir.join(QWEN_MODEL_FILE))
}

#[tauri::command]
fn qwen_model_status(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(model_path(&app)?.is_file())
}

#[tauri::command]
async fn download_qwen_model(app: tauri::AppHandle) -> Result<(), String> {
    let path = model_path(&app)?;
    if path.is_file() {
        return Ok(());
    }
    let dir = path.parent().ok_or("Cartella del modello non valida")?;
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Impossibile creare la cartella del modello: {e}"))?;
    let partial = path.with_extension("gguf.part");
    let client = reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(60 * 60))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Preparazione del download non riuscita: {e}"))?;
    let result = async {
        let mut response = client
            .get(QWEN_MODEL_URL)
            .send()
            .await
            .map_err(|e| format!("Download non riuscito: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Download non riuscito: {e}"))?;
        let total = response.content_length().unwrap_or(0);
        if total > MAX_MODEL_DOWNLOAD_BYTES {
            return Err("Il download del modello supera il limite di 2 GB".into());
        }
        let mut file = std::fs::File::create(&partial)
            .map_err(|e| format!("Impossibile creare il file del modello: {e}"))?;
        let mut digest = sha2::Sha256::new();
        let mut downloaded = 0_u64;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Download interrotto: {e}"))?
        {
            downloaded = next_model_download_size(downloaded, chunk.len())?;
            file.write_all(&chunk)
                .map_err(|e| format!("Salvataggio modello non riuscito: {e}"))?;
            digest.update(&chunk);
            let percent = downloaded
                .saturating_mul(100)
                .checked_div(total)
                .map(|value| value.min(100) as u8)
                .unwrap_or(0);
            let _ = app.emit("qwen-download-progress", percent);
        }
        file.flush().map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        if downloaded < MIN_MODEL_DOWNLOAD_BYTES || (total > 0 && downloaded != total) {
            return Err("Il file scaricato è incompleto".into());
        }
        if format!("{:x}", digest.finalize()) != QWEN_MODEL_SHA256 {
            return Err("Verifica di integrità del modello non riuscita".into());
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    if let Err(error) = std::fs::rename(&partial, &path) {
        let _ = std::fs::remove_file(&partial);
        return Err(format!("Impossibile completare il salvataggio: {error}"));
    }
    Ok(())
}

fn generate_local_answer(
    backend: &LlamaBackend,
    model: &LlamaModel,
    prompt: &str,
) -> Result<String, String> {
    let mut params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(4096));
    params = params.with_n_threads(4).with_n_threads_batch(4);
    let mut context = model
        .new_context(backend, params)
        .map_err(|e| format!("Preparazione del modello non riuscita: {e}"))?;
    let bounded = prompt.chars().take(9000).collect::<String>();
    let chat = format!("<|im_start|>system\nSei l'assistente di lettura di Carta. Rispondi in italiano, con chiarezza e senza inventare informazioni assenti dal passaggio. Distingui sempre ciò che dice il testo dalla tua interpretazione.\n<|im_end|>\n<|im_start|>user\n{bounded}\n<|im_end|>\n<|im_start|>assistant\n");
    let tokens = model.vocab().tokenize(chat.as_bytes(), true, true);
    if tokens.len() + 384 > context.n_ctx() as usize {
        return Err("Il testo è troppo lungo: seleziona un passaggio più breve".into());
    }
    let token_count = tokens.len();
    let mut batch = LlamaBatch::new(token_count.max(1), 1);
    for (i, token) in tokens.into_iter().enumerate() {
        batch
            .add(token, i as i32, &[0], i + 1 == token_count)
            .map_err(|e| e.to_string())?;
    }
    context
        .decode(&mut batch)
        .map_err(|e| format!("Il modello non ha elaborato il testo: {e}"))?;
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(0.7),
        LlamaSampler::top_p(0.8, 40),
        LlamaSampler::dist(42),
    ]);
    let mut output = Vec::new();
    for position in (batch.n_tokens()..).take(384) {
        let token = sampler.sample(&context, batch.n_tokens() - 1);
        sampler.accept(token);
        if model.vocab().is_eog(token) {
            break;
        }
        output.extend(model.vocab().token_to_piece(token, true, None));
        batch.clear();
        batch
            .add(token, position, &[0], true)
            .map_err(|e| e.to_string())?;
        context
            .decode(&mut batch)
            .map_err(|e| format!("Generazione interrotta: {e}"))?;
    }
    Ok(String::from_utf8_lossy(&output).trim().to_string())
}

#[tauri::command]
async fn ask_qwen(
    app: tauri::AppHandle,
    state: State<'_, LocalAiState>,
    prompt: String,
) -> Result<String, String> {
    let path = model_path(&app)?;
    if !path.is_file() {
        return Err("Scarica prima Qwen per usare l'assistente".into());
    }
    let engine = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = engine
            .lock()
            .map_err(|_| "Il motore AI non è disponibile".to_string())?;
        if slot.is_none() {
            let backend = LlamaBackend::init()
                .map_err(|e| format!("Avvio del motore AI non riuscito: {e}"))?;
            let model = LlamaModel::load_from_file(&backend, path, &LlamaModelParams::default())
                .map_err(|e| format!("Caricamento di Qwen non riuscito: {e}"))?;
            *slot = Some(LocalAiEngine { backend, model });
        }
        let loaded = slot.as_ref().expect("modello inizializzato");
        generate_local_answer(&loaded.backend, &loaded.model, &prompt)
    })
    .await
    .map_err(|e| format!("Elaborazione AI interrotta: {e}"))?
}
