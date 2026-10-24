// Verkleint een foto van de camera/galerij in de browser. De foto wordt in de (gedeelde)
// database bewaard, dus houden we hem klein: max. 1000 px en liefst onder ~250 KB.

const MAX_BYTES = 250 * 1024;

export async function verkleinFoto(bestand) {
  let beeld;
  try {
    beeld = await createImageBitmap(bestand, { imageOrientation: 'from-image' });
  } catch {
    beeld = await laadAlsImg(bestand);
  }
  let blob;
  for (const [maxZijde, kwaliteit] of [[1000, 0.78], [900, 0.7], [800, 0.62], [700, 0.55]]) {
    blob = await teken(beeld, maxZijde, kwaliteit);
    if (blob.size <= MAX_BYTES) break;
  }
  if (beeld.close) beeld.close();
  return blob;
}

function teken(beeld, maxZijde, kwaliteit) {
  const schaal = Math.min(1, maxZijde / Math.max(beeld.width, beeld.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(beeld.width * schaal);
  canvas.height = Math.round(beeld.height * schaal);
  canvas.getContext('2d').drawImage(beeld, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto verwerken mislukt'))), 'image/jpeg', kwaliteit);
  });
}

function laadAlsImg(bestand) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(bestand);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Kon de foto niet lezen')); };
    img.src = url;
  });
}
