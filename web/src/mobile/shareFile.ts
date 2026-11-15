import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(''));
}

export async function shareNativeFile(name: string, blob: Blob) {
  const filename = name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-160);
  const { uri } = await Filesystem.writeFile({ directory: Directory.Cache, path: `firely-exports/${filename}`, data: await blobBase64(blob), recursive: true });
  await Share.share({ title: name, files: [uri] });
}
