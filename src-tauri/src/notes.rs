use rusqlite::{params, Connection, Error, OptionalExtension};
use std::path::Path;

#[derive(serde::Serialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub body: String,
}

pub fn get(connection: &Connection, title: &str) -> Result<Note, String> {
    connection
        .query_row(
            "SELECT id, title, body FROM notes WHERE title = ?1",
            [title],
            |row| {
                Ok(Note {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|error| {
            eprintln!("Failed to load note: {error}");
            "Could not load the note. Please try again.".to_string()
        })?
        .ok_or_else(|| "This note no longer exists.".to_string())
}

pub fn update(connection: &Connection, id: i64, title: &str, body: &str) -> Result<(), String> {
    let title = validate(title, body)?;
    let count = connection
        .execute(
            "UPDATE notes SET title = ?1, body = ?2 WHERE id = ?3",
            params![title, body, id],
        )
        .map_err(write_error)?;
    if count == 0 {
        return Err("This note no longer exists.".into());
    }
    Ok(())
}

pub fn delete(connection: &Connection, id: i64) -> Result<(), String> {
    let count = connection
        .execute("DELETE FROM notes WHERE id = ?1", [id])
        .map_err(|error| {
            eprintln!("Failed to delete note: {error}");
            "Could not delete the note. Please try again.".to_string()
        })?;
    if count == 0 {
        return Err("This note no longer exists.".into());
    }
    Ok(())
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let connection = Connection::open(path)?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL UNIQUE CHECK(length(trim(title)) >= 2),
            body TEXT NOT NULL CHECK(length(trim(body)) >= 5)
        );",
    )?;
    Ok(connection)
}

pub fn list_titles(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare("SELECT title FROM notes")?;
    let mut titles = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    titles.sort_by_cached_key(|title| (title.to_lowercase(), title.clone()));
    Ok(titles)
}

fn validate<'a>(title: &'a str, body: &str) -> Result<&'a str, String> {
    let title = title.trim();
    if title.chars().count() < 2 {
        return Err(
            "Title must contain at least 2 characters, excluding surrounding whitespace.".into(),
        );
    }
    if body.trim().chars().count() < 5 {
        return Err(
            "Body must contain at least 5 characters, excluding surrounding whitespace.".into(),
        );
    }

    Ok(title)
}

pub fn save(connection: &Connection, title: &str, body: &str) -> Result<(), String> {
    let title = validate(title, body)?;
    connection
        .execute(
            "INSERT INTO notes (title, body) VALUES (?1, ?2)",
            params![title, body],
        )
        .map(|_| ())
        .map_err(write_error)
}

fn write_error(error: Error) -> String {
    match error {
        Error::SqliteFailure(code, _)
            if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
        {
            "A note with this title already exists. Choose a different title.".into()
        }
        error => {
            eprintln!("Failed to save note: {error}");
            "Could not save the note. Please try again.".into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        open(Path::new(":memory:")).unwrap()
    }

    #[test]
    fn deletes_only_selected_note_after_rename_and_frees_title() {
        let connection = database();
        save(&connection, "First", "First body").unwrap();
        save(&connection, "Second", "Second body").unwrap();
        let note = get(&connection, "First").unwrap();
        update(&connection, note.id, "Renamed", "Updated body").unwrap();
        delete(&connection, note.id).unwrap();
        assert_eq!(list_titles(&connection).unwrap(), ["Second"]);
        assert!(get(&connection, "Renamed").is_err());
        assert_eq!(get(&connection, "Second").unwrap().body, "Second body");
        assert!(delete(&connection, note.id).is_err());
        save(&connection, "Renamed", "New body").unwrap();
        assert_eq!(list_titles(&connection).unwrap(), ["Renamed", "Second"]);
        delete(&connection, get(&connection, "Renamed").unwrap().id).unwrap();
        delete(&connection, get(&connection, "Second").unwrap().id).unwrap();
        assert!(list_titles(&connection).unwrap().is_empty());
    }

    #[test]
    fn loads_and_updates_the_same_note_including_renaming() {
        let connection = database();
        save(&connection, "Zebra", "Original body").unwrap();
        let note = get(&connection, "Zebra").unwrap();
        assert_eq!(note.body, "Original body");
        update(&connection, note.id, "Zebra", "Updated body").unwrap();
        update(&connection, note.id, "  Apple  ", "  <b>Plain text</b>\n  ").unwrap();
        let updated = get(&connection, "Apple").unwrap();
        assert_eq!(updated.id, note.id);
        assert_eq!(updated.body, "  <b>Plain text</b>\n  ");
        assert!(get(&connection, "Zebra").is_err());
        assert_eq!(list_titles(&connection).unwrap(), ["Apple"]);
    }

    #[test]
    fn invalid_updates_leave_saved_notes_unchanged() {
        let connection = database();
        save(&connection, "First", "Original body").unwrap();
        save(&connection, "Second", "Other body").unwrap();
        let note = get(&connection, "First").unwrap();
        for (title, body) in [
            ("", "Valid body"),
            ("x", "Valid body"),
            ("First", "    "),
            ("First", "1234"),
            ("Second", "Valid body"),
        ] {
            assert!(update(&connection, note.id, title, body).is_err());
        }
        assert_eq!(get(&connection, "First").unwrap().body, "Original body");
        assert_eq!(get(&connection, "Second").unwrap().body, "Other body");
        assert!(get(&connection, "Missing").is_err());
        assert!(update(&connection, -1, "Missing", "Valid body").is_err());
        assert_eq!(list_titles(&connection).unwrap().len(), 2);
    }

    #[test]
    fn lists_all_titles_alphabetically_ignoring_case() {
        let connection = database();
        assert!(list_titles(&connection).unwrap().is_empty());
        for title in ["zebra", "banana", "apple", "Apple", "Éclair", "école"] {
            save(&connection, title, "Valid body").unwrap();
        }
        assert_eq!(
            list_titles(&connection).unwrap(),
            ["Apple", "apple", "banana", "zebra", "Éclair", "école"]
        );
        save(&connection, "Apricot", "Another body").unwrap();
        assert_eq!(list_titles(&connection).unwrap()[2], "Apricot");
    }

    #[test]
    fn saves_minimum_lengths_and_preserves_plain_text() {
        let connection = database();
        save(&connection, "  Hi  ", "  <b>Text</b>\n'quoted' 📝  ").unwrap();
        save(&connection, "Ok", "12345").unwrap();
        let note: (String, String) = connection
            .query_row(
                "SELECT title, body FROM notes WHERE title = 'Hi'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(note, ("Hi".into(), "  <b>Text</b>\n'quoted' 📝  ".into()));
    }

    #[test]
    fn rejects_empty_whitespace_and_short_fields() {
        let connection = database();
        for title in ["", " \n\t ", "a", " a ", "📝"] {
            assert!(save(&connection, title, "Valid body").is_err());
        }
        for body in ["", " \n\t ", "1234", " 1234 ", "📝📝📝📝"] {
            assert!(save(&connection, "Valid title", body).is_err());
        }
        let count: i64 = connection
            .query_row("SELECT count(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn rejects_duplicate_trimmed_titles_without_overwriting() {
        let connection = database();
        save(&connection, "Title", "Original body").unwrap();
        assert_eq!(
            save(&connection, " Title ", "Replacement body").unwrap_err(),
            "A note with this title already exists. Choose a different title."
        );
        save(&connection, "title", "Case-sensitive title").unwrap();
        let body: String = connection
            .query_row("SELECT body FROM notes WHERE title = 'Title'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(body, "Original body");
    }

    #[test]
    fn schema_enforces_constraints() {
        let connection = database();
        for (title, body) in [
            ("a", "Valid body"),
            ("Title", "1234"),
            ("  ", "Valid body"),
            ("Title", "     "),
        ] {
            assert!(connection
                .execute(
                    "INSERT INTO notes (title, body) VALUES (?1, ?2)",
                    params![title, body]
                )
                .is_err());
        }
        save(&connection, "Title", "Valid body").unwrap();
        assert!(connection
            .execute(
                "INSERT INTO notes (title, body) VALUES ('Title', 'Another body')",
                []
            )
            .is_err());
    }

    #[test]
    fn notes_persist_after_reopening_database() {
        let path =
            std::env::temp_dir().join(format!("fragments-one-test-{}.sqlite3", std::process::id()));
        {
            let connection = open(&path).unwrap();
            save(&connection, "Persistent note", "Saved body").unwrap();
        }
        let connection = open(&path).unwrap();
        let body: String = connection
            .query_row(
                "SELECT body FROM notes WHERE title = 'Persistent note'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(body, "Saved body");
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }
}
