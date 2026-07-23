import type { LibraryItem } from "../../shared/types";
import { api } from "../api";
import { createStudioService } from "./studioService";

export const studioService = createStudioService({
  storage: window.localStorage,
  listLibrary: () => api.libraryList() as Promise<LibraryItem[]>,
  saveLibrary: (input) => api.librarySave(input) as Promise<LibraryItem>,
  deleteLibrary: (id) => api.libraryDelete(id),
});

