import { describe, expect, it } from 'vitest';
import {
  activeDocument,
  createWorkspace,
  groupIdAt,
  MAX_EDITOR_COLUMNS,
  MAX_EDITOR_ROWS,
  visibleGroupIds,
  workspaceReducer,
  type WorkspaceDocument,
} from '../src/workspace/workspace';

function document(id: string, path: string | null = null): WorkspaceDocument {
  return { id, path, revision: 0, dirty: false, lineCount: 1, characterCount: 0 };
}

function reduce(state: ReturnType<typeof createWorkspace>, ...actions: Parameters<typeof workspaceReducer>[1][]) {
  return actions.reduce(workspaceReducer, state);
}

describe('Multi-document editor workspace', () => {
  it('keeps independent document dirty state and active tabs per group', () => {
    let state = createWorkspace(document('a', '/a.md'));
    state = reduce(state,
      { type: 'add-document', document: document('b', '/b.md') },
      { type: 'split', direction: 'right' });
    const secondGroup = state.activeGroupId;
    state = reduce(state,
      { type: 'select-document', groupId: secondGroup, documentId: 'a' },
      { type: 'patch-document', documentId: 'b', patch: { dirty: true, revision: 2 } });
    expect(activeDocument(state)?.id).toBe('a');
    expect(state.groups[groupIdAt(0, 0)].activeDocumentId).toBe('b');
    expect(state.groups[secondGroup].activeDocumentId).toBe('a');
    expect(state.documents.a.dirty).toBe(false);
    expect(state.documents.b.dirty).toBe(true);
  });

  it('selects an existing path instead of creating a duplicate buffer', () => {
    let state = createWorkspace(document('a', '/a.md'));
    state = reduce(state,
      { type: 'add-document', document: document('b', '/b.md') },
      { type: 'select-document', groupId: state.activeGroupId, documentId: 'a' });
    expect(state.documentOrder).toEqual(['a', 'b']);
    expect(activeDocument(state)?.path).toBe('/a.md');
  });

  it('updates every group when a document closes without deleting other documents', () => {
    let state = createWorkspace(document('a'));
    state = reduce(state,
      { type: 'add-document', document: document('b') },
      { type: 'split', direction: 'right' },
      { type: 'select-document', groupId: state.activeGroupId, documentId: 'a' },
      { type: 'close-document', documentId: 'a' });
    expect(state.documentOrder).toEqual(['b']);
    expect(state.groups[groupIdAt(0, 0)].activeDocumentId).toBe('b');
    expect(state.groups[state.activeGroupId].activeDocumentId).toBe('b');
    state = workspaceReducer(state, { type: 'close-document', documentId: 'b' });
    expect(state.documentOrder).toEqual([]);
    expect(Object.values(state.groups).every((group) => group.activeDocumentId === null)).toBe(true);
  });

  it('expands right and down without losing hidden group state', () => {
    let state = createWorkspace(document('a'));
    state = reduce(state,
      { type: 'split', direction: 'right' },
      { type: 'split', direction: 'down' },
      { type: 'add-document', document: document('b') },
      { type: 'reset-grid' });
    expect(state.rows).toBe(1);
    expect(state.columns).toBe(1);
    expect(state.documentOrder).toEqual(['a', 'b']);
    expect(activeDocument(state)?.id).toBe('b');
    state = reduce(state, { type: 'split', direction: 'right' }, { type: 'split', direction: 'down' });
    expect(activeDocument(state)?.id).toBe('b');
  });

  it('enforces the four-column by three-row limit', () => {
    let state = createWorkspace(document('a'));
    for (let index = 0; index < 8; index += 1) state = workspaceReducer(state, { type: 'split', direction: 'right' });
    for (let index = 0; index < 6; index += 1) state = workspaceReducer(state, { type: 'split', direction: 'down' });
    expect(state.columns).toBe(MAX_EDITOR_COLUMNS);
    expect(state.rows).toBe(MAX_EDITOR_ROWS);
    expect(visibleGroupIds(state.rows, state.columns)).toHaveLength(12);
  });

  it('patches only the captured document during asynchronous operations', () => {
    let state = createWorkspace(document('a'));
    state = workspaceReducer(state, { type: 'add-document', document: document('b') });
    state = workspaceReducer(state, { type: 'patch-document', documentId: 'a', patch: { dirty: false, path: '/saved-a.md' } });
    expect(activeDocument(state)?.id).toBe('b');
    expect(state.documents.a.path).toBe('/saved-a.md');
    expect(state.documents.b.path).toBeNull();
  });
});
