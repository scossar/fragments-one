import { invoke } from "@tauri-apps/api/core";

const form = document.querySelector<HTMLFormElement>("#note-form")!;
const titleInput = document.querySelector<HTMLInputElement>("#note-title")!;
const bodyInput = document.querySelector<HTMLTextAreaElement>("#note-body")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save-button")!;
const deleteButton = document.querySelector<HTMLButtonElement>("#delete-button")!;
const status = document.querySelector<HTMLParagraphElement>("#save-status")!;
const sidebar = document.querySelector<HTMLElement>("#notes-sidebar")!;
const sidebarToggle = document.querySelector<HTMLButtonElement>("#sidebar-toggle")!;
const newNoteButton = document.querySelector<HTMLButtonElement>("#new-note-button")!;
const noteTitles = document.querySelector<HTMLUListElement>("#note-titles")!;
const sidebarStatus = document.querySelector<HTMLParagraphElement>("#sidebar-status")!;
const heading = document.querySelector<HTMLHeadingElement>("h1")!;

interface Note {
  id: number;
  title: string;
  body: string;
}

let selectedNote: Note | null = null;
let saving = false;
let noteRequest = 0;

function setFormBusy(busy: boolean) {
  saveButton.disabled = busy;
  deleteButton.disabled = busy;
  newNoteButton.disabled = saving && busy;
  titleInput.readOnly = busy;
  bodyInput.readOnly = busy;
}

function markSelectedTitle() {
  for (const button of noteTitles.querySelectorAll<HTMLButtonElement>("button")) {
    if (button.textContent === selectedNote?.title) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  }
}

function resetToNewNote() {
  ++noteRequest;
  selectedNote = null;
  form.reset();
  titleInput.setCustomValidity("");
  bodyInput.setCustomValidity("");
  heading.textContent = "New Note";
  saveButton.textContent = "Save";
  deleteButton.hidden = true;
  markSelectedTitle();
  status.textContent = "";
  delete status.dataset.state;
  titleInput.focus();
}

newNoteButton.addEventListener("click", () => {
  if (saving) return;
  resetToNewNote();
  setFormBusy(false);
});

async function loadNote(title: string) {
  if (saving) return;
  const request = ++noteRequest;
  setFormBusy(true);
  status.textContent = "Loading note…";
  status.dataset.state = "pending";
  try {
    const note = await invoke<Note>("get_note", { title });
    if (request !== noteRequest) return;
    selectedNote = note;
    titleInput.value = note.title;
    bodyInput.value = note.body;
    heading.textContent = "Edit note";
    saveButton.textContent = "Update";
    deleteButton.hidden = false;
    validate();
    markSelectedTitle();
    status.textContent = "";
  } catch (error) {
    if (request !== noteRequest) return;
    status.textContent = typeof error === "string" ? error : "Could not load the note.";
    status.dataset.state = "error";
  } finally {
    if (request === noteRequest) setFormBusy(false);
  }
}

sidebarToggle.addEventListener("click", () => {
  sidebar.hidden = !sidebar.hidden;
  sidebarToggle.setAttribute("aria-expanded", String(!sidebar.hidden));
});

let titlesRequest = 0;

async function refreshTitles() {
  const request = ++titlesRequest;
  sidebarStatus.textContent = "Loading notes…";
  try {
    const titles = await invoke<string[]>("list_note_titles");
    if (request !== titlesRequest) return;
    const items = titles.map((title) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = title;
      button.addEventListener("click", () => void loadNote(title));
      item.append(button);
      return item;
    });
    noteTitles.replaceChildren(...items);
    markSelectedTitle();
    sidebarStatus.textContent = titles.length === 0 ? "No saved notes yet." : "";
  } catch (error) {
    if (request !== titlesRequest) return;
    sidebarStatus.textContent =
      typeof error === "string" ? error : "Could not load saved note titles.";
  }
}

void refreshTitles();

function validate() {
  titleInput.setCustomValidity(
    Array.from(titleInput.value.trim()).length < 2
      ? "Enter a title with at least 2 characters, excluding surrounding whitespace."
      : "",
  );
  bodyInput.setCustomValidity(
    Array.from(bodyInput.value.trim()).length < 5
      ? "Enter a body with at least 5 characters, excluding surrounding whitespace."
      : "",
  );
}

form.addEventListener("input", () => {
  validate();
  status.textContent = "";
});

deleteButton.addEventListener("click", async () => {
  if (!selectedNote || deleteButton.disabled) return;
  saving = true;
  setFormBusy(true);
  status.textContent = "Deleting…";
  status.dataset.state = "pending";
  try {
    await invoke("delete_note", { id: selectedNote.id });
    resetToNewNote();
    status.textContent = "Note deleted.";
    status.dataset.state = "success";
    titleInput.focus();
    await refreshTitles();
  } catch (error) {
    status.textContent = typeof error === "string"
      ? error : "Could not delete the note. Please try again.";
    status.dataset.state = "error";
  } finally {
    saving = false;
    setFormBusy(false);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  validate();
  if (saveButton.disabled || !form.reportValidity()) return;

  saving = true;
  setFormBusy(true);
  status.textContent = selectedNote ? "Updating…" : "Saving…";
  status.dataset.state = "pending";

  try {
    const values = {
      title: titleInput.value.trim(),
      body: bodyInput.value,
    };
    if (selectedNote) {
      await invoke("update_note", { id: selectedNote.id, ...values });
      selectedNote = { id: selectedNote.id, ...values };
      titleInput.value = values.title;
      status.textContent = "Note updated.";
    } else {
      await invoke("save_note", values);
      form.reset();
      status.textContent = "Note saved.";
    }
    status.dataset.state = "success";
    titleInput.focus();
    await refreshTitles();
  } catch (error) {
    status.textContent =
      typeof error === "string" ? error : "Could not save the note. Please try again.";
    status.dataset.state = "error";
  } finally {
    saving = false;
    setFormBusy(false);
  }
});
