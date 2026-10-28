-- Nodes accept the `file` kind (issue #49). SQLite cannot change a CHECK
-- constraint in place: the table is rebuilt, its rows and index kept.
CREATE TABLE nodes_new (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('terminal', 'orchestrator', 'note', 'kanban', 'git', 'file')),
  payload_json TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);

INSERT INTO nodes_new (id, workspace_id, kind, payload_json, updated_at)
  SELECT id, workspace_id, kind, payload_json, updated_at FROM nodes;

DROP TABLE nodes;
ALTER TABLE nodes_new RENAME TO nodes;
CREATE INDEX nodes_workspace ON nodes(workspace_id);
