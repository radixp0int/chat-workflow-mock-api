import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
const client =
  process.env.WORKFLOW_PROTOCOL_FILE ?? '../chat-interfaces/apps/workflows/src/run/wireProtocol.ts';
if (!existsSync(client)) {
  if (process.env.WORKFLOW_PROTOCOL_FILE) throw new Error(`Missing protocol file: ${client}`);
  console.log('No sibling workflow UI protocol; skipping optional cross-repo check.');
} else {
  const printer = ts.createPrinter({ removeComments: true });
  const normalize = (path) =>
    printer.printFile(
      ts.createSourceFile('protocol.ts', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true),
    );
  if (normalize(client) !== normalize('src/workflow/types.ts'))
    throw new Error('Workflow protocol differs from the UI. Update both contracts together.');
}
