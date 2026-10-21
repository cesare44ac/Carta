#[tauri::command]
fn open_dictionary_url(url: String) -> Result<(), String> {
    const ITALIAN_TO_ENGLISH: &str =
        "https://dictionary.cambridge.org/it/dizionario/italiano-inglese/";
    const ENGLISH_TO_ITALIAN: &str =
        "https://dictionary.cambridge.org/it/dizionario/inglese-italiano/";

    if !(url.starts_with(ITALIAN_TO_ENGLISH) || url.starts_with(ENGLISH_TO_ITALIAN)) {
        return Err("Indirizzo del dizionario non valido".into());
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(&url);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(&url);
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(&url);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Impossibile aprire il browser: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_dictionary_url])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Carta");
}
