//! ModelForge desktop shell: the unchanged web app in the OS webview.
//!
//! One custom scheme, `mf`, serves both the app's files and `/api/*`, so the app
//! stays same-origin and its relative `fetch("/api/...")` calls work untouched.
//! WebView2 (Windows) exposes the scheme as `http://mf.localhost/`; WKWebView and
//! WebKitGTK as `mf://localhost/`. That origin keys IndexedDB and localStorage,
//! so it must never change once the app ships.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod materials;
mod web;
mod workers;

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("mf", |ctx, request, responder| {
            ctx.app_handle()
                .state::<workers::Pool>()
                .submit(request, responder);
        })
        .setup(|app| {
            let site = web::Site::new(
                web::app_root(app.handle())?,
                app.path().app_data_dir()?.join("model-backups"),
            );
            app.manage(workers::Pool::new(site)?);
            let url: Url = "mf://localhost/index.html".parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::CustomProtocol(url))
                .title("ModelForge")
                .inner_size(1440.0, 900.0)
                .initialization_script(&web::desktop_script())
                .on_navigation(web::navigation_allowed)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("ModelForge failed to start");
}
