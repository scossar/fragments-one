import { invoke } from "@tauri-apps/api/core";
import { minimalSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { resolvePreviewImages } from "./images";

const form = document.querySelector<HTMLFormElement>("#note-form")!;
const titleInput = document.querySelector<HTMLInputElement>("#note-title")!;
const bodyContainer = document.querySelector<HTMLDivElement>("#note-body")!;
const bodyError = document.querySelector<HTMLParagraphElement>("#body-error")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save-button")!;
const deleteButton = document.querySelector<HTMLButtonElement>("#delete-button")!;
const status = document.querySelector<HTMLParagraphElement>("#save-status")!;
const sidebar = document.querySelector<HTMLElement>("#notes-sidebar")!;
const sidebarToggle = document.querySelector<HTMLButtonElement>("#sidebar-toggle")!;
const newNoteButton = document.querySelector<HTMLButtonElement>("#new-note-button")!;
const noteTitles = document.querySelector<HTMLUListElement>("#note-titles")!;
const sidebarStatus = document.querySelector<HTMLParagraphElement>("#sidebar-status")!;
const heading = document.querySelector<HTMLHeadingElement>("h1")!;
const viewEditToggle = document.querySelector<HTMLButtonElement>("#view-edit-toggle")!;
const preview = document.querySelector<HTMLDivElement>("#note-preview")!;
const bodyHelp = document.querySelector<HTMLParagraphElement>("#body-help")!;

interface Note {
  id: number;
  title: string;
  body: string;
}

let selectedNote: Note | null = null;
let saving = false;
let noteRequest = 0;
let viewing = false;
const bodyReadOnly = new Compartment();

function bodyState(doc = "") {
  return EditorState.create({
    doc,
    extensions: [
      minimalSetup,
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      bodyReadOnly.of(EditorState.readOnly.of(saveButton.disabled)),
      EditorView.contentAttributes.of({
        id: "note-body-input",
        role: "textbox",
        "aria-labelledby": "body-label",
        "aria-describedby": "body-help body-error",
        "aria-multiline": "true",
        "aria-required": "true",
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          status.textContent = "";
          if (bodyError.textContent) validateBody();
        }
      }),
    ],
  });
}

const bodyEditor = new EditorView({ parent: bodyContainer, state: bodyState() });

function setViewing(view: boolean) {
  viewing = view;
  if (view) {
    preview.innerHTML = DOMPurify.sanitize(
      marked.parse(bodyEditor.state.doc.toString(), { async: false }),
      { USE_PROFILES: { html: true }, FORBID_TAGS: ["form", "input", "button", "textarea", "select", "style"], FORBID_ATTR: ["style"] },
    );
    resolvePreviewImages(preview);
  } else {
    preview.replaceChildren();
  }
  preview.hidden = !view;
  bodyContainer.hidden = view;
  bodyHelp.hidden = view;
  bodyError.hidden = view || !bodyError.textContent;
  titleInput.readOnly = view || saveButton.disabled;
  saveButton.hidden = view;
  viewEditToggle.textContent = view ? "Edit" : "View";
  viewEditToggle.setAttribute("aria-pressed", String(view));
  if (!view) bodyEditor.requestMeasure();
}

viewEditToggle.addEventListener("click", () => {
  if (viewEditToggle.disabled) return;
  setViewing(!viewing);
  if (!viewing) bodyEditor.focus();
});

function setBody(value: string) {
  // A new state keeps undo history from crossing between different notes.
  bodyEditor.setState(bodyState(value));
  clearBodyError();
}

function clearBodyError() {
  bodyError.textContent = "";
  bodyError.hidden = true;
  bodyEditor.contentDOM.setAttribute("aria-invalid", "false");
}

function validateBody() {
  const valid = Array.from(bodyEditor.state.doc.toString().trim()).length >= 5;
  bodyError.textContent = valid ? "" :
    "Enter a body with at least 5 characters, excluding surrounding whitespace.";
  bodyError.hidden = valid;
  bodyEditor.contentDOM.setAttribute("aria-invalid", String(!valid));
  return valid;
}

function setFormBusy(busy: boolean) {
  saveButton.disabled = busy;
  deleteButton.disabled = busy;
  viewEditToggle.disabled = busy;
  newNoteButton.disabled = saving && busy;
  titleInput.readOnly = busy || viewing;
  bodyEditor.dispatch({ effects: bodyReadOnly.reconfigure(EditorState.readOnly.of(busy)) });
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
  setBody("");
  setViewing(false);
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
    setBody(note.body);
    setViewing(true);
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
  if (!validateBody()) {
    setViewing(false);
    bodyEditor.focus();
    return;
  }

  saving = true;
  setFormBusy(true);
  status.textContent = selectedNote ? "Updating…" : "Saving…";
  status.dataset.state = "pending";

  try {
    const values = {
      title: titleInput.value.trim(),
      body: bodyEditor.state.doc.toString(),
    };
    if (selectedNote) {
      await invoke("update_note", { id: selectedNote.id, ...values });
      selectedNote = { id: selectedNote.id, ...values };
      titleInput.value = values.title;
      status.textContent = "Note updated.";
    } else {
      await invoke("save_note", values);
      form.reset();
      setBody("");
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
