export const MAX_EDITOR_COLUMNS = 4;
export const MAX_EDITOR_ROWS = 3;

export interface WorkspaceDocument {
  id: string;
  path: string | null;
  revision: number;
  dirty: boolean;
  lineCount: number;
  characterCount: number;
}

export interface EditorGroupState {
  id: string;
  activeDocumentId: string | null;
}

export interface WorkspaceState {
  documents: Record<string, WorkspaceDocument>;
  documentOrder: string[];
  groups: Record<string, EditorGroupState>;
  rows: number;
  columns: number;
  activeGroupId: string;
}

export type WorkspaceAction =
  | { type: 'add-document'; document: WorkspaceDocument; groupId?: string }
  | { type: 'patch-document'; documentId: string; patch: Partial<Omit<WorkspaceDocument, 'id'>> }
  | { type: 'close-document'; documentId: string }
  | { type: 'select-document'; groupId: string; documentId: string }
  | { type: 'activate-group'; groupId: string }
  | { type: 'split'; direction: 'right' | 'down' }
  | { type: 'reset-grid' };

export function groupIdAt(row: number, column: number): string {
  return `group-${row}-${column}`;
}

export function visibleGroupIds(rows: number, columns: number): string[] {
  const ids: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) ids.push(groupIdAt(row, column));
  }
  return ids;
}

function allGroups(): Record<string, EditorGroupState> {
  return Object.fromEntries(visibleGroupIds(MAX_EDITOR_ROWS, MAX_EDITOR_COLUMNS)
    .map((id) => [id, { id, activeDocumentId: null }]));
}

export function createWorkspace(document: WorkspaceDocument): WorkspaceState {
  const groups = allGroups();
  groups[groupIdAt(0, 0)].activeDocumentId = document.id;
  return {
    documents: { [document.id]: document },
    documentOrder: [document.id],
    groups,
    rows: 1,
    columns: 1,
    activeGroupId: groupIdAt(0, 0),
  };
}

export function activeDocument(state: WorkspaceState): WorkspaceDocument | null {
  const id = state.groups[state.activeGroupId]?.activeDocumentId;
  return id ? state.documents[id] ?? null : null;
}

function fillNewGroups(
  state: WorkspaceState,
  rows: number,
  columns: number,
  activeGroupId = state.activeGroupId,
): WorkspaceState {
  const previouslyVisible = new Set(visibleGroupIds(state.rows, state.columns));
  const fallbackDocumentId = state.groups[activeGroupId]?.activeDocumentId
    ?? state.documentOrder[0] ?? null;
  const groups = { ...state.groups };
  for (const id of visibleGroupIds(rows, columns)) {
    if (!previouslyVisible.has(id) && !groups[id].activeDocumentId) {
      groups[id] = { ...groups[id], activeDocumentId: fallbackDocumentId };
    }
  }
  return { ...state, groups, rows, columns, activeGroupId };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'add-document': {
      if (state.documents[action.document.id]) return state;
      const groupId = action.groupId ?? state.activeGroupId;
      if (!state.groups[groupId]) return state;
      return {
        ...state,
        documents: { ...state.documents, [action.document.id]: action.document },
        documentOrder: [...state.documentOrder, action.document.id],
        groups: {
          ...state.groups,
          [groupId]: { ...state.groups[groupId], activeDocumentId: action.document.id },
        },
      };
    }
    case 'patch-document': {
      const document = state.documents[action.documentId];
      if (!document) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.documentId]: { ...document, ...action.patch },
        },
      };
    }
    case 'close-document': {
      const index = state.documentOrder.indexOf(action.documentId);
      if (index < 0) return state;
      const documentOrder = state.documentOrder.filter((id) => id !== action.documentId);
      const replacement = documentOrder[Math.min(index, documentOrder.length - 1)] ?? null;
      const documents = { ...state.documents };
      delete documents[action.documentId];
      const groups = Object.fromEntries(Object.entries(state.groups).map(([id, group]) => [
        id,
        group.activeDocumentId === action.documentId
          ? { ...group, activeDocumentId: replacement }
          : group,
      ]));
      return { ...state, documents, documentOrder, groups };
    }
    case 'select-document': {
      if (!state.groups[action.groupId] || !state.documents[action.documentId]) return state;
      return {
        ...state,
        activeGroupId: action.groupId,
        groups: {
          ...state.groups,
          [action.groupId]: { ...state.groups[action.groupId], activeDocumentId: action.documentId },
        },
      };
    }
    case 'activate-group':
      return state.groups[action.groupId] ? { ...state, activeGroupId: action.groupId } : state;
    case 'split': {
      const match = /^group-(\d+)-(\d+)$/.exec(state.activeGroupId);
      if (!match) return state;
      const row = Number(match[1]);
      const column = Number(match[2]);
      if (action.direction === 'right') {
        if (state.columns >= MAX_EDITOR_COLUMNS) return state;
        const columns = state.columns + 1;
        const targetColumn = Math.min(column + 1, columns - 1);
        const targetId = groupIdAt(Math.min(row, state.rows - 1), targetColumn);
        return fillNewGroups(state, state.rows, columns, targetId);
      }
      if (state.rows >= MAX_EDITOR_ROWS) return state;
      const rows = state.rows + 1;
      const targetRow = Math.min(row + 1, rows - 1);
      const targetId = groupIdAt(targetRow, Math.min(column, state.columns - 1));
      return fillNewGroups(state, rows, state.columns, targetId);
    }
    case 'reset-grid': {
      const activeId = activeDocument(state)?.id ?? state.documentOrder[0] ?? null;
      const groups = { ...state.groups, [groupIdAt(0, 0)]: { ...state.groups[groupIdAt(0, 0)], activeDocumentId: activeId } };
      return { ...state, groups, rows: 1, columns: 1, activeGroupId: groupIdAt(0, 0) };
    }
  }
}
