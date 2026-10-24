// Verkleint een foto van de camera/galerij in de browser, zodat de opslag klein blijft.

export async function verkleinFoto(bestand, maxZijde = 1400, kwaliteit = 0.82) {
  let beeld;
  try {
    beeld = await createImageBitmap(bestand, { imageOrientation: 'from-image' });
  } catch {
    beeld = await laadAlsImg(bestand);
  }
  const schaal = Math.min(1, maxZijde / Math.max(beeld.width, beeld.height));
  const w = Math.round(beeld.width * schaal);
  const h = Math.round(beeld.height * schaal);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(beeld, 0, 0, w, h);
  if (beeld.close) beeld.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Foto verwerken mislukt'))), 'image/jpeg', kwaliteit);
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
