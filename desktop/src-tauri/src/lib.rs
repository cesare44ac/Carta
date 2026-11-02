use keyring_core::{Entry as CredentialEntry, Error as CredentialError};
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
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, State};
use zeroize::Zeroizing;

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

fn validate_research_result_url(input: &str) -> Result<reqwest::Url, String> {
    if input.len() > 2048 {
        return Err("Il link della ricerca è troppo lungo".into());
    }
    let parsed =
        reqwest::Url::parse(input).map_err(|_| "Link della ricerca non valido".to_string())?;
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    let ip_host = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(&host);
    let is_local = host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || ip_host.parse::<std::net::IpAddr>().is_ok();
    if parsed.scheme() != "https"
        || host.is_empty()
        || is_local
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some_and(|port| port != 443)
    {
        return Err("Il link deve essere HTTPS e puntare a una fonte pubblica".into());
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAccessWork {
    title: String,
    year: Option<i64>,
    authors: String,
    venue: String,
    #[serde(rename = "abstract")]
    abstract_text: String,
    landing_url: String,
    pdf_url: Option<String>,
    source: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ResearchNewsItem {
    title: String,
    source: String,
    date: String,
    snippet: String,
    url: String,
}

#[derive(serde::Deserialize)]
struct RssEnvelope {
    channel: RssChannel,
}

#[derive(serde::Deserialize)]
struct RssChannel {
    #[serde(default)]
    item: Vec<RssEntry>,
}

#[derive(serde::Deserialize)]
struct RssEntry {
    title: Option<String>,
    link: Option<String>,
    description: Option<String>,
    #[serde(rename = "pubDate")]
    pub_date: Option<String>,
}

#[derive(Clone, Copy)]
struct ResearchFeed {
    source: &'static str,
    label: &'static str,
    url: &'static str,
}

const RESEARCH_FEEDS: &[ResearchFeed] = &[
    ResearchFeed {
        source: "lse",
        label: "LSE · Impact of Social Sciences",
        url: "https://blogs.lse.ac.uk/impactofsocialsciences/feed/",
    },
    ResearchFeed {
        source: "imf",
        label: "IMF · Working Papers",
        url: "https://www.imf.org/en/publications/rss?language=eng&series=Working+Papers",
    },
    ResearchFeed {
        source: "imf",
        label: "IMF · Staff Discussion Notes",
        url: "https://www.imf.org/en/publications/rss?language=eng&series=Staff+Discussion+Notes",
    },
    ResearchFeed {
        source: "ecb",
        label: "BCE · Working Papers",
        url: "https://www.ecb.europa.eu/rss/wppub.html",
    },
    ResearchFeed {
        source: "ecb",
        label: "BCE · Research Bulletin",
        url: "https://www.ecb.europa.eu/rss/rbu.html",
    },
    ResearchFeed {
        source: "ecb",
        label: "BCE · Notizie",
        url: "https://www.ecb.europa.eu/rss/press.html",
    },
    ResearchFeed {
        source: "fed",
        label: "Federal Reserve · Working Papers",
        url: "https://www.federalreserve.gov/feeds/working_papers.xml",
    },
    ResearchFeed {
        source: "fed",
        label: "Federal Reserve · FEDS Notes",
        url: "https://www.federalreserve.gov/feeds/feds_notes.xml",
    },
    ResearchFeed {
        source: "fed",
        label: "Federal Reserve · Comunicati",
        url: "https://www.federalreserve.gov/feeds/press_all.xml",
    },
];

fn research_source_info(source: &str) -> Result<(&'static str, &'static str), String> {
    match source {
        "all" => Ok(("", "OpenAlex · Accesso aperto")),
        "lse" => Ok(("I909854389", "LSE · OpenAlex")),
        "imf" => Ok(("I1310145890", "IMF · OpenAlex")),
        "ecb" => Ok(("I153515283", "BCE · OpenAlex")),
        "fed" => Ok(("I2802905149", "Federal Reserve · OpenAlex")),
        _ => Err("Fonte di ricerca non riconosciuta".into()),
    }
}

fn openalex_abstract(value: &serde_json::Value) -> String {
    let Some(index) = value.as_object() else {
        return String::new();
    };
    let mut words = Vec::<(usize, &str)>::new();
    for (word, positions) in index {
        if let Some(positions) = positions.as_array() {
            for position in positions.iter().filter_map(serde_json::Value::as_u64) {
                if position < 20_000 {
                    words.push((position as usize, word));
                }
            }
        }
    }
    words.sort_unstable_by_key(|(position, _)| *position);
    shorten_text(
        &words
            .into_iter()
            .take(150)
            .map(|(_, word)| word)
            .collect::<Vec<_>>()
            .join(" "),
        760,
    )
}

#[tauri::command]
async fn search_open_access_research(
    query: String,
    source: String,
) -> Result<Vec<OpenAccessWork>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Inserisci un argomento, un autore o un titolo".into());
    }
    let query = shorten_text(query, 160);
    let (institution_id, source_label) = research_source_info(source.trim())?;
    let client = reqwest::Client::builder()
        .user_agent("Carta Reader/3.5.3 (open access research discovery)")
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Avvio della ricerca non riuscito: {error}"))?;
    let mut url =
        reqwest::Url::parse("https://api.openalex.org/works").map_err(|error| error.to_string())?;
    let mut filter = "open_access.is_oa:true".to_string();
    if !institution_id.is_empty() {
        filter.push_str(&format!(",authorships.institutions.id:{institution_id}"));
    }
    url.query_pairs_mut()
        .append_pair("search", &query)
        .append_pair("filter", &filter)
        .append_pair("sort", "publication_date:desc")
        .append_pair("per_page", "15")
        .append_pair("select", "id,display_name,publication_year,authorships,primary_location,best_oa_location,open_access,abstract_inverted_index,doi,type");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Ricerca non raggiungibile: {error}"))?;
    let json: serde_json::Value = read_json_response(response, MAX_SEARCH_RESPONSE_BYTES).await?;
    let mut results = Vec::new();
    for work in json
        .get("results")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
    {
        if work["open_access"]["is_oa"].as_bool() != Some(true) {
            continue;
        }
        let location = &work["best_oa_location"];
        let title = work["display_name"]
            .as_str()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Senza titolo")
            .to_string();
        let authors = work["authorships"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .take(5)
                    .filter_map(|item| item["author"]["display_name"].as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        let venue = location["source"]["display_name"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let candidate_landing = location["landing_page_url"]
            .as_str()
            .or_else(|| work["doi"].as_str())
            .or_else(|| work["id"].as_str());
        let Some(landing_url) =
            candidate_landing.and_then(|value| validate_research_result_url(value).ok())
        else {
            continue;
        };
        let pdf_url = location["pdf_url"]
            .as_str()
            .and_then(|value| validate_research_result_url(value).ok())
            .map(|value| value.to_string());
        results.push(OpenAccessWork {
            title,
            year: work["publication_year"].as_i64(),
            authors,
            venue,
            abstract_text: openalex_abstract(&work["abstract_inverted_index"]),
            landing_url: landing_url.to_string(),
            pdf_url,
            source: source_label.to_string(),
        });
    }
    Ok(results)
}

fn clean_feed_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len().min(2048));
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }
    let cleaned = output.replace("&nbsp;", " ").replace("&#160;", " ");
    shorten_text(
        &cleaned.split_whitespace().collect::<Vec<_>>().join(" "),
        640,
    )
}

fn parse_research_feed(xml: &str, source_label: &str) -> Result<Vec<ResearchNewsItem>, String> {
    let feed: RssEnvelope =
        quick_xml::de::from_str(xml).map_err(|error| format!("Feed non leggibile: {error}"))?;
    let mut items = Vec::new();
    for entry in feed.channel.item.into_iter().take(30) {
        let title = entry
            .title
            .map(|value| clean_feed_text(&value))
            .unwrap_or_default();
        let Some(raw_url) = entry.link else { continue };
        let Ok(url) = validate_research_result_url(raw_url.trim()) else {
            continue;
        };
        if title.is_empty() {
            continue;
        }
        let date = entry
            .pub_date
            .map(|value| clean_feed_text(&value))
            .unwrap_or_default();
        let snippet = entry
            .description
            .map(|value| clean_feed_text(&value))
            .unwrap_or_default();
        items.push(ResearchNewsItem {
            title,
            source: source_label.to_string(),
            date,
            snippet,
            url: url.to_string(),
        });
    }
    Ok(items)
}

#[tauri::command]
async fn fetch_research_news(source: String) -> Result<Vec<ResearchNewsItem>, String> {
    let source = source.trim();
    if !matches!(source, "all" | "lse" | "imf" | "ecb" | "fed") {
        return Err("Fonte di notizie non riconosciuta".into());
    }
    let feeds = RESEARCH_FEEDS
        .iter()
        .copied()
        .filter(|feed| source == "all" || feed.source == source)
        .collect::<Vec<_>>();
    let client = reqwest::Client::builder()
        .user_agent("Carta Reader/3.5.3 (official research feeds)")
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Avvio delle notizie non riuscito: {error}"))?;
    let pending = feeds.iter().map(|feed| {
        let client = client.clone();
        async move {
            let response = client
                .get(feed.url)
                .send()
                .await
                .map_err(|error| error.to_string())?;
            let response = response
                .error_for_status()
                .map_err(|error| error.to_string())?;
            let body = read_bounded_response(response, 1024 * 1024).await?;
            let xml = String::from_utf8(body).map_err(|error| error.to_string())?;
            parse_research_feed(&xml, feed.label)
        }
    });
    let feed_results = futures_util::future::join_all(pending).await;
    let mut results = Vec::new();
    for feed_result in feed_results.into_iter().flatten() {
        results.extend(feed_result);
    }
    let has_imf_updates = results.iter().any(|item| item.source.starts_with("IMF ·"));
    if !has_imf_updates && matches!(source, "all" | "imf") {
        results.push(ResearchNewsItem {
            title: "Ultime notizie IMF".into(),
            source: "IMF · Sito ufficiale".into(),
            date: String::new(),
            snippet: "Il feed non è disponibile su questa rete. Apri il portale ufficiale per consultare gli aggiornamenti recenti.".into(),
            url: "https://www.imf.org/en/news".into(),
        });
    }
    let mut seen = std::collections::HashSet::new();
    results.retain(|item| seen.insert(item.url.clone()));
    results.truncate(40);
    if results.is_empty() {
        return Err("Le fonti selezionate non hanno restituito notizie. Riprova più tardi.".into());
    }
    Ok(results)
}

async fn read_bounded_response(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let mut response = response
        .error_for_status()
        .map_err(|error| format!("Risposta della fonte non valida: {error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("Il feed supera il limite di dimensione".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        append_bounded_chunk(&mut body, &chunk, max_bytes)?;
    }
    Ok(body)
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
        .user_agent("Carta Reader/3.5.2 (book research)")
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

#[tauri::command]
fn open_research_result(url: String) -> Result<(), String> {
    let parsed = validate_research_result_url(&url)?;

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
        .setup(|app| {
            let ai_state = app.state::<LocalAiState>().inner().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(60));
                let Ok(mut state) = ai_state.0.lock() else {
                    continue;
                };
                if state
                    .last_used
                    .is_some_and(|last_used| last_used.elapsed() >= Duration::from_secs(300))
                {
                    state.engine.take();
                    state.last_used = None;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_dictionary_url,
            open_spotify_app,
            search_web,
            open_web_result,
            search_open_access_research,
            fetch_research_news,
            open_research_result,
            get_spotify_playback,
            spotify_media_control,
            qwen_model_status,
            download_qwen_model,
            unload_qwen_model,
            ask_qwen,
            ai_has_api_key,
            ai_store_api_key,
            ai_remove_api_key,
            ai_list_ollama_models,
            ask_ai
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
    fn open_access_links_must_be_public_https_urls() {
        assert!(validate_research_result_url("https://doi.org/10.1234/example").is_ok());
        assert!(validate_research_result_url("http://doi.org/10.1234/example").is_err());
        assert!(validate_research_result_url("javascript:alert(1)").is_err());
        assert!(validate_research_result_url("https://localhost/file.pdf").is_err());
        assert!(validate_research_result_url("https://127.0.0.1/file.pdf").is_err());
        assert!(validate_research_result_url("https://[::1]/file.pdf").is_err());
        assert!(validate_research_result_url("https://user@doi.org/10.1234/example").is_err());
        assert!(validate_research_result_url("https://doi.org:444/10.1234/example").is_err());
        assert!(
            validate_research_result_url(&format!("https://doi.org/{}", "x".repeat(2050))).is_err()
        );
    }

    #[test]
    fn research_sources_are_a_fixed_allowlist() {
        assert_eq!(research_source_info("lse").unwrap().0, "I909854389");
        assert_eq!(research_source_info("imf").unwrap().0, "I1310145890");
        assert_eq!(research_source_info("ecb").unwrap().0, "I153515283");
        assert_eq!(research_source_info("fed").unwrap().0, "I2802905149");
        assert!(research_source_info("https://attacker.test").is_err());
    }

    #[test]
    fn rss_entries_are_text_only_and_external_links_are_validated() {
        let xml = r#"<?xml version="1.0"?><rss version="2.0"><channel><item><title>New &amp; useful research</title><link>https://www.ecb.europa.eu/research</link><description><![CDATA[<p>Evidence and <b>analysis</b>.</p>]]></description><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>http://localhost/</link></item></channel></rss>"#;
        let entries = parse_research_feed(xml, "ECB").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "New & useful research");
        assert_eq!(entries[0].snippet, "Evidence and analysis.");
        assert_eq!(entries[0].source, "ECB");
        assert_eq!(entries[0].url, "https://www.ecb.europa.eu/research");
    }

    #[test]
    fn openalex_abstract_restores_word_order() {
        let index = serde_json::json!({"growth":[2], "Economic":[0], "model":[1]});
        assert_eq!(openalex_abstract(&index), "Economic model growth");
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
struct LocalAiStateInner {
    engine: Option<LocalAiEngine>,
    last_used: Option<Instant>,
}
#[derive(Clone, Default)]
struct LocalAiState(Arc<Mutex<LocalAiStateInner>>);

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
    let bounded = prompt.chars().take(9000).collect::<String>();
    let chat = format!("<|im_start|>system\nSei l'assistente di lettura di Carta. Rispondi in italiano, con chiarezza e senza inventare informazioni assenti dal passaggio. Distingui sempre ciò che dice il testo dalla tua interpretazione.\n<|im_end|>\n<|im_start|>user\n{bounded}\n<|im_end|>\n<|im_start|>assistant\n");
    let tokens = model.vocab().tokenize(chat.as_bytes(), true, true);
    let output_limit = 384_usize;
    let required_context = tokens.len().saturating_add(output_limit);
    let context_size = [2048_u32, 3072, 4096]
        .into_iter()
        .find(|size| required_context <= *size as usize)
        .ok_or_else(|| "Il testo è troppo lungo: seleziona un passaggio più breve".to_string())?;
    let mut params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(context_size));
    params = params.with_n_threads(4).with_n_threads_batch(4);
    let mut context = model
        .new_context(backend, params)
        .map_err(|e| format!("Preparazione del modello non riuscita: {e}"))?;
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
    for position in (batch.n_tokens()..).take(output_limit) {
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
        let mut state = engine
            .lock()
            .map_err(|_| "Il motore AI non è disponibile".to_string())?;
        if state.engine.is_none() {
            let backend = LlamaBackend::init()
                .map_err(|e| format!("Avvio del motore AI non riuscito: {e}"))?;
            let model = LlamaModel::load_from_file(&backend, path, &LlamaModelParams::default())
                .map_err(|e| format!("Caricamento di Qwen non riuscito: {e}"))?;
            state.engine = Some(LocalAiEngine { backend, model });
        }
        let result = {
            let loaded = state.engine.as_ref().expect("modello inizializzato");
            generate_local_answer(&loaded.backend, &loaded.model, &prompt)
        };
        state.last_used = Some(Instant::now());
        result
    })
    .await
    .map_err(|e| format!("Elaborazione AI interrotta: {e}"))?
}

#[tauri::command]
fn unload_qwen_model(state: State<'_, LocalAiState>) -> Result<(), String> {
    let mut state = state
        .0
        .lock()
        .map_err(|_| "Il motore AI non è disponibile".to_string())?;
    state.engine.take();
    state.last_used = None;
    Ok(())
}

const AI_CREDENTIAL_SERVICE: &str = "io.carta.reader.ai";
const MAX_AI_PROMPT_CHARS: usize = 24_000;
const MAX_AI_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

fn initialize_credential_store() -> Result<(), String> {
    static INITIALIZED: OnceLock<Result<(), String>> = OnceLock::new();
    INITIALIZED
        .get_or_init(|| {
            #[cfg(target_os = "windows")]
            {
                let store = windows_native_keyring_store::Store::new()
                    .map_err(|_| "Il portachiavi di sistema non è disponibile".to_string())?;
                keyring_core::set_default_store(store);
                return Ok(());
            }
            #[cfg(target_os = "macos")]
            {
                let store = apple_native_keyring_store::keychain::Store::new()
                    .map_err(|_| "Il portachiavi di sistema non è disponibile".to_string())?;
                keyring_core::set_default_store(store);
                return Ok(());
            }
            #[cfg(target_os = "linux")]
            {
                let store = dbus_secret_service_keyring_store::Store::new()
                    .map_err(|_| "Il portachiavi di sistema non è disponibile".to_string())?;
                keyring_core::set_default_store(store);
                return Ok(());
            }
            #[allow(unreachable_code)]
            Err("Il portachiavi di sistema non è disponibile su questa piattaforma".into())
        })
        .clone()
}

fn validate_cloud_provider(provider: &str) -> Result<&'static str, String> {
    match provider {
        "openai" => Ok("openai"),
        "anthropic" => Ok("anthropic"),
        "gemini" => Ok("gemini"),
        "compatible" => Ok("compatible"),
        _ => Err("Provider AI non supportato".into()),
    }
}

fn credential_entry(provider: &str) -> Result<CredentialEntry, String> {
    let provider = validate_cloud_provider(provider)?;
    initialize_credential_store()?;
    CredentialEntry::new(AI_CREDENTIAL_SERVICE, provider)
        .map_err(|_| "Il portachiavi di sistema non è disponibile".to_string())
}

#[tauri::command]
fn ai_has_api_key(provider: String) -> Result<bool, String> {
    let entry = credential_entry(&provider)?;
    match entry.get_password() {
        Ok(password) => {
            drop(Zeroizing::new(password));
            Ok(true)
        }
        Err(CredentialError::NoEntry) => Ok(false),
        Err(_) => Err("Non è stato possibile leggere il portachiavi di sistema".into()),
    }
}

#[tauri::command]
fn ai_store_api_key(provider: String, api_key: String) -> Result<(), String> {
    let api_key = Zeroizing::new(api_key);
    let trimmed = api_key.trim();
    if trimmed.is_empty()
        || trimmed.len() > 4096
        || trimmed.chars().any(|character| character.is_control())
    {
        return Err("La chiave API non è valida".into());
    }
    credential_entry(&provider)?
        .set_password(trimmed)
        .map_err(|_| "Non è stato possibile salvare la chiave nel portachiavi di sistema".into())
}

#[tauri::command]
fn ai_remove_api_key(provider: String) -> Result<(), String> {
    credential_entry(&provider)?
        .delete_credential()
        .map_err(|_| "Non è stato possibile rimuovere la chiave dal portachiavi di sistema".into())
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

fn validate_ollama_endpoint(input: &str) -> Result<reqwest::Url, String> {
    let url =
        reqwest::Url::parse(input.trim()).map_err(|_| "Indirizzo Ollama non valido".to_string())?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "http"
        || !is_loopback_host(host)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err("Ollama deve essere raggiunto tramite un indirizzo locale (localhost)".into());
    }
    Ok(url)
}

fn validate_compatible_endpoint(input: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(input.trim())
        .map_err(|_| "Indirizzo compatibile non valido".to_string())?;
    let host = url.host_str().unwrap_or_default();
    let local_http = url.scheme() == "http" && is_loopback_host(host);
    if (!local_http && url.scheme() != "https")
        || host.is_empty()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Usa un indirizzo HTTPS oppure HTTP locale".into());
    }
    Ok(url)
}

fn validate_ai_model(model: &str, allow_slash: bool) -> Result<(), String> {
    let valid = !model.is_empty()
        && model.len() <= 200
        && model.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '.' | '_' | '-' | ':')
                || (allow_slash && character == '/')
        });
    if !valid {
        return Err("Nome del modello non valido".into());
    }
    Ok(())
}

fn ai_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(12))
        .timeout(std::time::Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Impossibile avviare il collegamento AI".into())
}

async fn read_ai_response(
    response: reqwest::Response,
    secret: Option<&str>,
) -> Result<serde_json::Value, String> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_AI_RESPONSE_BYTES as u64)
    {
        return Err("La risposta dell’AI è troppo grande".into());
    }
    let mut response = response;
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Lettura della risposta AI non riuscita".to_string())?
    {
        append_bounded_chunk(&mut body, &chunk, MAX_AI_RESPONSE_BYTES)
            .map_err(|_| "La risposta dell’AI è troppo grande".to_string())?;
    }
    let value: serde_json::Value = serde_json::from_slice(&body).map_err(|_| {
        format!("Il provider AI ha restituito una risposta non leggibile ({status})")
    })?;
    if !status.is_success() {
        let mut message = value
            .pointer("/error/message")
            .or_else(|| value.pointer("/error"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("richiesta non riuscita")
            .to_string();
        if let Some(secret) = secret.filter(|secret| !secret.is_empty()) {
            message = message.replace(secret, "[chiave nascosta]");
        }
        return Err(format!(
            "Provider AI: errore HTTP {} — {}",
            status.as_u16(),
            shorten_text(&message, 500)
        ));
    }
    Ok(value)
}

async fn ollama_models(endpoint: &str) -> Result<Vec<String>, String> {
    let mut url = validate_ollama_endpoint(endpoint)?;
    url.set_path("/api/tags");
    let response = ai_http_client()?
        .get(url)
        .send()
        .await
        .map_err(|_| "Ollama non è raggiungibile. Avvia Ollama e riprova".to_string())?;
    let json = read_ai_response(response, None).await?;
    let mut models = json
        .get("models")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "Ollama non ha restituito l’elenco dei modelli".to_string())?
        .iter()
        .filter_map(|model| {
            model
                .get("name")
                .or_else(|| model.get("model"))
                .and_then(serde_json::Value::as_str)
        })
        .take(200)
        .map(str::to_string)
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

#[tauri::command]
async fn ai_list_ollama_models(endpoint: String) -> Result<Vec<String>, String> {
    ollama_models(&endpoint).await
}

fn extract_ai_text(provider: &str, response: &serde_json::Value) -> Option<String> {
    let text = match provider {
        "openai" | "compatible" => {
            if let Some(text) = response
                .get("output_text")
                .and_then(serde_json::Value::as_str)
            {
                return Some(text.to_string());
            }
            if let Some(text) = response
                .pointer("/choices/0/message/content")
                .and_then(serde_json::Value::as_str)
            {
                return Some(text.to_string());
            }
            response
                .get("output")?
                .as_array()?
                .iter()
                .flat_map(|block| {
                    block
                        .get("content")
                        .and_then(serde_json::Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        }
        "anthropic" => response
            .get("content")?
            .as_array()?
            .iter()
            .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        "gemini" => response
            .pointer("/candidates/0/content/parts")?
            .as_array()?
            .iter()
            .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        "ollama" => response.pointer("/message/content")?.as_str()?.to_string(),
        _ => return None,
    };
    (!text.trim().is_empty()).then_some(text)
}

async fn ask_cloud_provider(
    provider: &str,
    model: &str,
    endpoint: &str,
    prompt: &str,
) -> Result<String, String> {
    let provider = validate_cloud_provider(provider)?;
    validate_ai_model(model, false)?;
    let client = ai_http_client()?;
    let api_key = Zeroizing::new(credential_entry(provider)?.get_password().map_err(|_| {
        "Salva una chiave API per questo provider nelle impostazioni AI".to_string()
    })?);
    let request = match provider {
        "openai" => client
            .post("https://api.openai.com/v1/responses")
            .bearer_auth(api_key.as_str())
            .json(&serde_json::json!({
                "model": model,
                "instructions": "Sei l'assistente di lettura di Carta. Rispondi in italiano, con chiarezza e senza inventare informazioni assenti dal passaggio. Distingui il testo dalla tua interpretazione.",
                "input": prompt,
                "store": false,
                "max_output_tokens": 1600
            })),
        "anthropic" => client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key.as_str())
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "max_tokens": 1600,
                "system": "Sei l'assistente di lettura di Carta. Rispondi in italiano, con chiarezza e senza inventare informazioni assenti dal passaggio. Distingui il testo dalla tua interpretazione.",
                "messages": [{"role":"user","content":prompt}]
            })),
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            );
            client
                .post(url)
                .header("x-goog-api-key", api_key.as_str())
                .json(&serde_json::json!({
                    "systemInstruction": {"parts": [{"text": "Sei l'assistente di lettura di Carta. Rispondi in italiano, con chiarezza e senza inventare informazioni assenti dal passaggio. Distingui il testo dalla tua interpretazione."}]},
                    "contents": [{"role":"user","parts":[{"text":prompt}]}],
                    "generationConfig": {"maxOutputTokens": 1600}
                }))
        }
        "compatible" => {
            let mut base = validate_compatible_endpoint(endpoint)?;
            let path = base.path().trim_end_matches('/');
            let suffix = if path.ends_with("/v1") {
                "chat/completions"
            } else {
                "v1/chat/completions"
            };
            base.set_path(&format!("{path}/{suffix}"));
            client
                .post(base)
                .bearer_auth(api_key.as_str())
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [
                        {"role":"system","content":"Sei l'assistente di lettura di Carta. Rispondi in italiano e non inventare informazioni."},
                        {"role":"user","content":prompt}
                    ],
                    "stream": false
                }))
        }
        _ => return Err("Provider AI non supportato".into()),
    };
    let response = request.send().await.map_err(|_| {
        format!("Connessione a {provider} non riuscita. Controlla rete e configurazione")
    })?;
    let value = read_ai_response(response, Some(&api_key)).await?;
    extract_ai_text(provider, &value).ok_or_else(|| "Il provider AI non ha restituito testo".into())
}

async fn ask_ollama(endpoint: &str, model: &str, prompt: &str) -> Result<String, String> {
    validate_ai_model(model, true)?;
    let mut url = validate_ollama_endpoint(endpoint)?;
    url.set_path("/api/chat");
    let response = ai_http_client()?
        .post(url)
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {"role":"system","content":"Sei l'assistente di lettura di Carta. Rispondi in italiano, con chiarezza e senza inventare informazioni assenti dal passaggio."},
                {"role":"user","content":prompt}
            ],
            "stream": false
        }))
        .send()
        .await
        .map_err(|_| "Ollama non è raggiungibile. Avvia Ollama e riprova".to_string())?;
    let value = read_ai_response(response, None).await?;
    extract_ai_text("ollama", &value).ok_or_else(|| "Ollama non ha restituito testo".into())
}

#[tauri::command]
async fn ask_ai(
    app: tauri::AppHandle,
    state: State<'_, LocalAiState>,
    provider: String,
    model: String,
    endpoint: String,
    prompt: String,
) -> Result<String, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Inserisci una domanda".into());
    }
    if prompt.chars().count() > MAX_AI_PROMPT_CHARS {
        return Err("Il testo da inviare è troppo lungo. Seleziona un passaggio più breve".into());
    }
    match provider.as_str() {
        "qwen" => ask_qwen(app, state, prompt.to_string()).await,
        "ollama" => ask_ollama(&endpoint, &model, prompt).await,
        "openai" | "anthropic" | "gemini" | "compatible" => {
            ask_cloud_provider(&provider, &model, &endpoint, prompt).await
        }
        _ => Err("Provider AI non supportato".into()),
    }
}

#[cfg(test)]
mod ai_provider_tests {
    use super::*;

    #[test]
    fn ollama_is_restricted_to_local_addresses() {
        assert!(validate_ollama_endpoint("http://127.0.0.1:11434").is_ok());
        assert!(validate_ollama_endpoint("http://localhost:11434/").is_ok());
        assert!(validate_ollama_endpoint("http://192.168.1.8:11434").is_err());
        assert!(validate_ollama_endpoint("https://localhost:11434").is_err());
        assert!(validate_ollama_endpoint("http://user@localhost:11434").is_err());
    }

    #[test]
    fn compatible_services_require_https_or_loopback_http() {
        assert!(validate_compatible_endpoint("https://ai.example/v1").is_ok());
        assert!(validate_compatible_endpoint("http://127.0.0.1:1234/v1").is_ok());
        assert!(validate_compatible_endpoint("http://ai.example/v1").is_err());
        assert!(validate_compatible_endpoint("https://user@ai.example/v1").is_err());
    }

    #[test]
    fn model_names_are_bounded_and_local_tags_are_supported() {
        assert!(validate_ai_model("gemini-3.8-flash", false).is_ok());
        assert!(validate_ai_model("gemma3:latest", true).is_ok());
        assert!(validate_ai_model("hf.co/library/model:Q4_K_M", true).is_ok());
        assert!(validate_ai_model("hf.co/library/model", false).is_err());
        assert!(validate_ai_model("model\nleak", true).is_err());
    }

    #[test]
    fn provider_responses_are_extracted_without_returning_raw_json() {
        let openai =
            serde_json::json!({"output":[{"content":[{"type":"output_text","text":"Risposta."}]}]});
        let anthropic = serde_json::json!({"content":[{"type":"text","text":"Risposta Claude."}]});
        let gemini =
            serde_json::json!({"candidates":[{"content":{"parts":[{"text":"Risposta Gemini."}]}}]});
        let ollama = serde_json::json!({"message":{"content":"Risposta locale."}});
        assert_eq!(
            extract_ai_text("openai", &openai).as_deref(),
            Some("Risposta.")
        );
        assert_eq!(
            extract_ai_text("anthropic", &anthropic).as_deref(),
            Some("Risposta Claude.")
        );
        assert_eq!(
            extract_ai_text("gemini", &gemini).as_deref(),
            Some("Risposta Gemini.")
        );
        assert_eq!(
            extract_ai_text("ollama", &ollama).as_deref(),
            Some("Risposta locale.")
        );
    }
}
