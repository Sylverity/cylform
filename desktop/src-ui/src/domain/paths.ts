export function displayNameForPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function extensionForPath(path: string): string {
  const fileName = displayNameForPath(path);
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return '';
  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function isSupportedMoleculePath(path: string, extensions: string[]): boolean {
  const extension = extensionForPath(path);
  if (!extension) return false;
  return extensions.some((candidate) => candidate.toLowerCase() === extension);
}
