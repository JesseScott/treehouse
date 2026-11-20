/**
 * The File System Access API (Chromium only): choosing a file in a way that leaves a handle
 * the app can keep in IndexedDB and read again later, after asking for permission. Other
 * browsers fall back to an ordinary file input, and their imports are synced by choosing the
 * file again.
 */

/** Why a remembered file could not be read again. Fixed codes; the wording lives in the UI. */
export type FileAccessErrorCode = 'permission-denied' | 'file-missing';

export class FileAccessError extends Error {
  constructor(readonly code: FileAccessErrorCode) {
    super(code);
    this.name = 'FileAccessError';
  }
}

interface PickerOptions {
  id?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}

/** The parts of the API that TypeScript's DOM library does not describe yet. */
interface PermissionHandle {
  queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
}

type OpenFilePicker = (options?: PickerOptions) => Promise<FileSystemFileHandle[]>;

function picker(): OpenFilePicker | undefined {
  const candidate = (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  return typeof candidate === 'function' ? (candidate.bind(window) as OpenFilePicker) : undefined;
}

/** True where a chosen file can be remembered and read again (Chromium). */
export const canRememberFiles = () => picker() !== undefined;

const GEDCOM_TYPES: NonNullable<PickerOptions['types']> = [
  {
    description: 'GEDCOM file or zip export',
    accept: {
      'application/octet-stream': ['.ged', '.gedcom'],
      'application/zip': ['.zip'],
    },
  },
];

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Asks the user for a GEDCOM file with the system picker. Null when they cancel; throws when
 * the picker is not available, so call `canRememberFiles()` first.
 */
export async function pickGedcom(): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
  const open = picker();
  if (!open) throw new Error('showOpenFilePicker is not available');
  let handles: FileSystemFileHandle[];
  try {
    handles = await open({ id: 'treehouse-gedcom', multiple: false, types: GEDCOM_TYPES });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
  const handle = handles[0];
  return handle ? { file: await handle.getFile(), handle } : null;
}

/** Reads a remembered file again, asking for permission first if the browser needs to. */
export async function readHandle(handle: FileSystemFileHandle): Promise<File> {
  const permissions = handle as FileSystemFileHandle & PermissionHandle;
  let state = (await permissions.queryPermission?.({ mode: 'read' })) ?? 'granted';
  if (state === 'prompt' && permissions.requestPermission) {
    state = await permissions.requestPermission({ mode: 'read' });
  }
  if (state !== 'granted') throw new FileAccessError('permission-denied');
  try {
    return await handle.getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new FileAccessError('permission-denied');
    }
    throw new FileAccessError('file-missing');
  }
}

/**
 * The handle of a file dropped on the page, where the browser offers one. Must be called
 * while the drop event is being handled; the promise can settle later.
 */
export function droppedHandle(items: DataTransferItemList): Promise<FileSystemFileHandle | null> {
  const item = items[0] as
    | (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
    | undefined;
  if (item?.kind !== 'file' || !item.getAsFileSystemHandle) return Promise.resolve(null);
  return item
    .getAsFileSystemHandle()
    .then((handle) => (handle?.kind === 'file' ? (handle as FileSystemFileHandle) : null))
    .catch(() => null);
}
