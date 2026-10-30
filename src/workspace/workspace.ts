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
  documentIds: string[];
}

export interface WorkspaceState {
  documents: Record<string, WorkspaceDocument>;
  documentOrder: string[];
  groups: Record<string, EditorGroupState>;
  groupOrder: string[];
  rows: number;
  columns: number;
  activeGroupId: string;
}

export type WorkspaceAction =
  | { type: 'add-document'; document: WorkspaceDocument; groupId?: string }
  | { type: 'patch-document'; documentId: string; patch: Partial<Omit<WorkspaceDocument, 'id'>> }
  | { type: 'close-document'; groupId: string; documentId: string }
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

export function editorGridSize(state: WorkspaceState): { rows: number; columns: number } {
  const columns = Math.min(state.columns, Math.max(1, state.groupOrder.length));
  return { columns, rows: Math.ceil(state.groupOrder.length / columns) || 1 };
}

export function canSplit(state: WorkspaceState, direction: 'right' | 'down'): boolean {
  if (state.groupOrder.length < state.rows * state.columns) return true;
  return direction === 'right' ? state.columns < MAX_EDITOR_COLUMNS : state.rows < MAX_EDITOR_ROWS;
}

function allGroups(): Record<string, EditorGroupState> {
  return Object.fromEntries(visibleGroupIds(MAX_EDITOR_ROWS, MAX_EDITOR_COLUMNS)
    .map((id) => [id, { id, activeDocumentId: null, documentIds: [] }]));
}

export function createWorkspace(document: WorkspaceDocument): WorkspaceState {
  const groups = allGroups();
  groups[groupIdAt(0, 0)] = { ...groups[groupIdAt(0, 0)], activeDocumentId: document.id, documentIds: [document.id] };
  return {
    documents: { [document.id]: document },
    documentOrder: [document.id],
    groups,
    groupOrder: [groupIdAt(0, 0)],
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
  addedGroupIds: string[],
  rows: number,
  columns: number,
  activeGroupId: string,
): WorkspaceState {
  const source = state.groups[state.activeGroupId];
  const fallbackDocumentIds = source?.documentIds ?? [];
  const fallbackActiveDocumentId = source?.activeDocumentId ?? fallbackDocumentIds[0] ?? null;
  const groups = { ...state.groups };
  for (const id of addedGroupIds) {
    if (!groups[id].documentIds.length && fallbackDocumentIds.length) {
      groups[id] = {
        ...groups[id],
        activeDocumentId: fallbackActiveDocumentId,
        documentIds: [...fallbackDocumentIds],
      };
    }
  }
  const added = new Set([...state.groupOrder, ...addedGroupIds]);
  const groupOrder = visibleGroupIds(rows, columns).filter((id) => added.has(id));
  return { ...state, groups, groupOrder, rows, columns, activeGroupId };
}

function splitTarget(
  state: WorkspaceState,
  direction: 'right' | 'down',
  candidates: string[],
  rows = state.rows,
  columns = state.columns,
): string {
  const match = /^group-(\d+)-(\d+)$/.exec(state.activeGroupId);
  if (!match) return candidates[0];
  const row = Number(match[1]);
  const column = Number(match[2]);
  const preferred = direction === 'right'
    ? groupIdAt(row, Math.min(column + 1, columns - 1))
    : groupIdAt(Math.min(row + 1, rows - 1), column);
  return candidates.includes(preferred) ? preferred : candidates[0];
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'add-document': {
      if (state.documents[action.document.id]) return state;
      const groupId = action.groupId ?? state.activeGroupId;
      if (!state.groupOrder.includes(groupId)) return state;
      const group = state.groups[groupId];
      return {
        ...state,
        documents: { ...state.documents, [action.document.id]: action.document },
        documentOrder: [...state.documentOrder, action.document.id],
        groups: {
          ...state.groups,
          [groupId]: { ...group, activeDocumentId: action.document.id, documentIds: [...group.documentIds, action.document.id] },
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
      const group = state.groups[action.groupId];
      if (!group || !state.groupOrder.includes(action.groupId)) return state;
      const index = group.documentIds.indexOf(action.documentId);
      if (index < 0) return state;
      const remaining = group.documentIds.filter((id) => id !== action.documentId);
      const groups = {
        ...state.groups,
        [action.groupId]: {
          ...group,
          activeDocumentId: remaining[Math.min(index, remaining.length - 1)] ?? null,
          documentIds: remaining,
        },
      };
      let documents = state.documents;
      let documentOrder = state.documentOrder;
      if (!Object.values(groups).some((item) => item.documentIds.includes(action.documentId))) {
        documents = { ...documents };
        delete documents[action.documentId];
        documentOrder = documentOrder.filter((id) => id !== action.documentId);
      }
      let groupOrder = state.groupOrder;
      let activeGroupId = state.activeGroupId;
      if (!remaining.length && groupOrder.length > 1) {
        const groupIndex = groupOrder.indexOf(action.groupId);
        groupOrder = groupOrder.filter((id) => id !== action.groupId);
        if (activeGroupId === action.groupId) {
          activeGroupId = groupOrder[Math.min(groupIndex, groupOrder.length - 1)];
        }
      }
      return { ...state, documents, documentOrder, groups, groupOrder, activeGroupId };
    }
    case 'select-document': {
      const group = state.groups[action.groupId];
      if (!group || !state.groupOrder.includes(action.groupId) || !state.documents[action.documentId]) return state;
      return {
        ...state,
        activeGroupId: action.groupId,
        groups: {
          ...state.groups,
          [action.groupId]: {
            ...group,
            activeDocumentId: action.documentId,
            documentIds: group.documentIds.includes(action.documentId)
              ? group.documentIds
              : [...group.documentIds, action.documentId],
          },
        },
      };
    }
    case 'activate-group':
      return state.groupOrder.includes(action.groupId) ? { ...state, activeGroupId: action.groupId } : state;
    case 'split': {
      if (!canSplit(state, action.direction)) return state;
      const currentIds = visibleGroupIds(state.rows, state.columns);
      const hiddenIds = currentIds.filter((id) => !state.groupOrder.includes(id));
      if (hiddenIds.length) {
        const targetId = splitTarget(state, action.direction, hiddenIds);
        return fillNewGroups(state, [targetId], state.rows, state.columns, targetId);
      }
      let rows = state.rows;
      let columns = state.columns;
      if (action.direction === 'right') columns += 1;
      else rows += 1;
      const current = new Set(currentIds);
      const addedGroupIds = visibleGroupIds(rows, columns).filter((id) => !current.has(id));
      const targetId = splitTarget(state, action.direction, [...state.groupOrder, ...addedGroupIds], rows, columns);
      return fillNewGroups(state, addedGroupIds, rows, columns, targetId);
    }
    case 'reset-grid': {
      const mainGroupId = groupIdAt(0, 0);
      const activeId = activeDocument(state)?.id ?? state.documentOrder[0] ?? null;
      const groups = {
        ...state.groups,
        [mainGroupId]: {
          ...state.groups[mainGroupId],
          activeDocumentId: activeId,
          documentIds: [...state.documentOrder],
        },
      };
      return {
        ...state,
        groups,
        groupOrder: [mainGroupId],
        rows: 1,
        columns: 1,
        activeGroupId: mainGroupId,
      };
    }
  }
}
