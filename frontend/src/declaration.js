// The MIRA filing declaration (declarant name, designation, contact) and the
// digital signature image. Stored on the device (localStorage), since the MIRA
// PDFs are generated in the browser and a signature shouldn't leave it.
const KEY = "kashikeyo.declaration.v1";

export function getDeclaration() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveDeclaration(decl) {
  try {
    localStorage.setItem(KEY, JSON.stringify(decl || {}));
  } catch {
    /* quota or disabled storage — ignore */
  }
}

/** Decode a data: URL ("data:image/png;base64,...") to raw bytes for pdf-lib. */
export function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const isPng = (dataUrl) => String(dataUrl || "").startsWith("data:image/png");
