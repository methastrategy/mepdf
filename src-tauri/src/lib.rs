#[tauri::command]
fn get_cli_pdf_path() -> Option<String> {
  std::env::args().skip(1).find(|arg| {
    let lower = arg.to_lowercase();
    lower.ends_with(".pdf") || lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg")
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![get_cli_pdf_path])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
