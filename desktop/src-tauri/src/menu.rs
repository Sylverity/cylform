use tauri::menu::{AboutMetadataBuilder, Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::devtools_menu_enabled;

pub(crate) const MENU_FILE_OPEN: &str = "file_open";
pub(crate) const MENU_FILE_OPEN_RECENT: &str = "file_open_recent";
pub(crate) const MENU_FILE_CLOSE_CURRENT: &str = "file_close_current";
pub(crate) const MENU_FILE_EXPORT_PNG: &str = "file_export_png";
pub(crate) const MENU_FILE_SETTINGS: &str = "file_settings";
pub(crate) const MENU_FILE_QUIT: &str = "file_quit";
pub(crate) const MENU_VIEW_RESET: &str = "view_reset";
pub(crate) const MENU_VIEW_OPEN_DEVTOOLS: &str = "view_open_devtools";

pub(crate) const EVENT_MENU_OPEN_FILE: &str = "menu:open-file";
pub(crate) const EVENT_MENU_OPEN_RECENT: &str = "menu:open-recent";
pub(crate) const EVENT_MENU_CLOSE_CURRENT_TAB: &str = "menu:close-current-tab";
pub(crate) const EVENT_MENU_EXPORT_PNG: &str = "menu:export-png";
pub(crate) const EVENT_MENU_OPEN_SETTINGS: &str = "menu:open-settings";
pub(crate) const EVENT_MENU_RESET_VIEW: &str = "menu:reset-view";
pub(crate) const EVENT_MENU_DEVTOOLS_DISABLED: &str = "menu:devtools-disabled";
#[cfg(not(any(debug_assertions, feature = "devtools")))]
pub(crate) const EVENT_MENU_DEVTOOLS_UNAVAILABLE: &str = "menu:devtools-unavailable";

pub(crate) fn menu_event_name(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        MENU_FILE_OPEN => Some(EVENT_MENU_OPEN_FILE),
        MENU_FILE_OPEN_RECENT => Some(EVENT_MENU_OPEN_RECENT),
        MENU_FILE_CLOSE_CURRENT => Some(EVENT_MENU_CLOSE_CURRENT_TAB),
        MENU_FILE_EXPORT_PNG => Some(EVENT_MENU_EXPORT_PNG),
        MENU_FILE_SETTINGS => Some(EVENT_MENU_OPEN_SETTINGS),
        MENU_VIEW_RESET => Some(EVENT_MENU_RESET_VIEW),
        _ => None,
    }
}

pub(crate) fn build_app_menu<R: tauri::Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<Menu<R>> {
    let open_file = MenuItemBuilder::with_id(MENU_FILE_OPEN, "Open File...")
        .accelerator("CommandOrControl+O")
        .build(manager)?;
    let open_recent = MenuItemBuilder::with_id(MENU_FILE_OPEN_RECENT, "Open Recent...")
        .accelerator("CommandOrControl+Shift+O")
        .build(manager)?;
    let close_current = MenuItemBuilder::with_id(MENU_FILE_CLOSE_CURRENT, "Close Current Molecule")
        .accelerator("CommandOrControl+W")
        .build(manager)?;
    let export_png = MenuItemBuilder::with_id(MENU_FILE_EXPORT_PNG, "Export Figure...")
        .accelerator("CommandOrControl+E")
        .build(manager)?;
    let settings = MenuItemBuilder::with_id(MENU_FILE_SETTINGS, "Settings...")
        .accelerator("CommandOrControl+,")
        .build(manager)?;
    let quit = MenuItemBuilder::with_id(MENU_FILE_QUIT, "Quit Cylform")
        .accelerator("CommandOrControl+Q")
        .build(manager)?;
    let reset_view = MenuItemBuilder::with_id(MENU_VIEW_RESET, "Reset View")
        .accelerator("R")
        .build(manager)?;
    let open_devtools = MenuItemBuilder::with_id(MENU_VIEW_OPEN_DEVTOOLS, "Open DevTools")
        .accelerator("CommandOrControl+Shift+I")
        .build(manager)?;

    let about = AboutMetadataBuilder::new()
        .name(Some("Cylform"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .authors(Some(vec!["Cylform Contributors".to_string()]))
        .comments(Some(
            "Publication-minded molecular viewing for XYZ and PDB structures.",
        ))
        .license(Some("Apache-2.0"))
        .website(Some("https://github.com/Sylverity/cylform"))
        .website_label(Some("Cylform on GitHub"))
        .build();

    let file_menu = SubmenuBuilder::new(manager, "File")
        .item(&open_file)
        .item(&open_recent)
        .separator()
        .item(&close_current)
        .item(&export_png)
        .separator()
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;
    let edit_menu = SubmenuBuilder::new(manager, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(manager, "View")
        .item(&reset_view)
        .fullscreen_with_text("Toggle Full Screen")
        .separator()
        .item(&open_devtools)
        .build()?;
    let window_menu = SubmenuBuilder::new(manager, "Window")
        .minimize()
        .maximize_with_text("Zoom")
        .close_window()
        .separator()
        .show_all_with_text("Bring All to Front")
        .build()?;
    let help_menu = SubmenuBuilder::new(manager, "Help")
        .about_with_text("About Cylform", Some(about))
        .build()?;

    Menu::with_items(
        manager,
        &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )
}

pub(crate) fn handle_app_menu_event(app: &AppHandle, menu_id: &str) {
    if menu_id == MENU_FILE_QUIT {
        app.exit(0);
        return;
    }

    if menu_id == MENU_VIEW_OPEN_DEVTOOLS {
        if !devtools_menu_enabled(app) {
            log::info!("DevTools menu action is disabled in app settings.");
            let _ = app.emit(EVENT_MENU_DEVTOOLS_DISABLED, ());
            return;
        }
        #[cfg(any(debug_assertions, feature = "devtools"))]
        {
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            } else {
                log::warn!("Could not open DevTools because the main window was not found.");
            }
        }
        #[cfg(not(any(debug_assertions, feature = "devtools")))]
        {
            log::warn!("DevTools are unavailable in this build.");
            let _ = app.emit(EVENT_MENU_DEVTOOLS_UNAVAILABLE, ());
        }
        return;
    }

    if let Some(event_name) = menu_event_name(menu_id) {
        let _ = app.emit(event_name, ());
    }
}
