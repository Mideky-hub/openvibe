-- Workspaces have a kind: the free `canvas` or the project's single `code`
-- workspace. Existing rows become canvases; a partial unique index keeps at most
-- one code workspace per project.
ALTER TABLE workspaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'canvas' CHECK (kind IN ('canvas', 'code'));

CREATE UNIQUE INDEX workspaces_one_code ON workspaces(project_id) WHERE kind = 'code';
