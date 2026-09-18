import type { SelectedSource, SourceFilePort } from '../application/ports';
import { readApprovedFile } from '../infrastructure/files/approvedSource';

type SelectFile = () => Promise<string | undefined>;
type ReadSelectedFile = (filePath: string) => Promise<SelectedSource>;

export function createApprovedSourceFilePort(selectFile: SelectFile, readSelectedFile: ReadSelectedFile = readApprovedFile): SourceFilePort {
  return {
    async chooseAndReadApprovedSource() {
      const filePath = await selectFile();
      return filePath ? readSelectedFile(filePath) : 'cancelled';
    },
  };
}
