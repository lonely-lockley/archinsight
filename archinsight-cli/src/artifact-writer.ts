import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ArtifactContent = string | Uint8Array;

/** Atomic filesystem writer shared by every CLI artifact format. */
export async function writeArtifact(
  file: string | undefined,
  content: ArtifactContent,
): Promise<void> {
  if (file === undefined || file === '-') {
    process.stdout.write(content);
    return;
  }
  const destination = path.resolve(file);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
