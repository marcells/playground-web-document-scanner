import Tesseract from 'tesseract.js';
const { createWorker } = Tesseract;

(async function() {
    const worker = createWorker({
        logger: m => console.log(m),
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
    });
    await worker.load();
    await worker.loadLanguage('deu');
    // await worker.loadLanguage('eng');
    await worker.initialize('deu');
    // await worker.initialize('eng');
    await worker.setParameters({
        tessedit_ocr_engine_mode: Tesseract.OEM.DEFAULT,
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        // tessedit_char_whitelist: '0123456789',
    });
    const result = await worker.recognize('image.png');
    
    console.log(result.data.text);

    await worker.terminate();
})();
