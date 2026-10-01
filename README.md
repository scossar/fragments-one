# Fragments One

A small Tauri experiment for saving plain-text notes. The form has a title input,
a CodeMirror body editor with Markdown syntax highlighting, and a Save button. A fixed-width (240px) sidebar lists all saved
titles alphabetically, ignoring case, and refreshes after each successful save.
Long titles wrap within the sidebar. The Toggle button at the far left of the top
bar opens and closes the sidebar. Clicking a title loads the saved title and body
into the form, changes the heading to Edit note, and changes Save to Update.
Updates keep the same note ID, can rename the title, and refresh the sidebar.
The form stays in edit mode after an update.
Delete appears beside Update while editing. Deleting removes the selected note,
refreshes the sidebar, and returns the form to New note mode.
The New note button beside Toggle clears the form, sets the heading to New Note,
and returns to Save mode.
Sidebar selections open in rendered Markdown view. The button at the form's
top-right switches between View (rendered HTML) and Edit (CodeMirror Markdown).
Switching modes preserves unsaved text; new notes start in Edit mode.
Rendered HTML is sanitized with DOMPurify before display.

Titles must have at least 2 characters after trimming surrounding whitespace and
must be unique (case-sensitive). Bodies must have at least 5 characters after
trimming for validation; the original body, including whitespace and line breaks,
is stored unchanged. Validation runs in both the frontend and Rust save command.
SQLite also enforces minimum lengths and title uniqueness.

The database is `notes.sqlite3` in Tauri's application data directory for
`com.scossar.fragments-one`. On Linux this is normally
`~/.local/share/com.scossar.fragments-one/notes.sqlite3`.
It is created automatically when the app starts.

```sh
npm install
npm run tauri dev
```

Checks:

```sh
npm run build
cd src-tauri
cargo test
```
