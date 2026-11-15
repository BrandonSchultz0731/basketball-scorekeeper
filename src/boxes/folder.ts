// Reading and writing files in a folder the user picks (Chrome's File System Access API), so training images
// land straight in footage/ instead of the Downloads folder.

interface DirectoryPicker {
  showDirectoryPicker?: (options?: { id?: string; mode?: string }) => Promise<FileSystemDirectoryHandle>;
}

export const canPickFolder = (): boolean => typeof (window as DirectoryPicker).showDirectoryPicker === 'function';

export const pickFolder = (): Promise<FileSystemDirectoryHandle> =>
  (window as DirectoryPicker).showDirectoryPicker!({ id: 'footage', mode: 'readwrite' });

/** The handle for `path` ('a/b/c.jpg') inside `root`, creating folders on the way. */
const fileHandle = async (root: FileSystemDirectoryHandle, path: string, create: boolean) => {
  const parts = path.split('/');
  let dir = root;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create });
  return dir.getFileHandle(parts.at(-1)!, { create });
};

export const writeFile = async (root: FileSystemDirectoryHandle, path: string, data: Blob | string): Promise<void> => {
  const w = await (await fileHandle(root, path, true)).createWritable();
  await w.write(data);
  await w.close();
};

/** The file's text, or null if it doesn't exist. */
export const readText = async (root: FileSystemDirectoryHandle, path: string): Promise<string | null> => {
  try {
    return await (await (await fileHandle(root, path, false)).getFile()).text();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null;
    throw err;
  }
};
