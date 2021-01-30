$(async function() {
    let scanned = false;
    let ratio = 1.0;
    let edgeRatio = 1.0;
    let contourDetails = null;

    $('#downloadScannedDocument').click(function() {
        this.href = $('#scannedDocument')[0].toDataURL();
        this.download = 'scan.png';
    });

    $('#scan-button').click(async function() {
        if (scanned) {
            $('#scannedDocument').hide();
            $('#overlay').show();
            $('#videoInput').show();
            
            scanned = false;
            streaming = true;
            devicesSelect.change();

            return;
        }

        const scannedDocument = document.getElementById('scannedDocument');
        scannedDocument.height = processingVideo.height;
        scannedDocument.width = processingVideo.width;

        const src = new cv.Mat(processingVideo.height, processingVideo.width, cv.CV_8UC4);
        const cap = new cv.VideoCapture(processingVideo);
        cap.read(src);

        if (contourDetails) {
            clearTimeout(timer);
            streaming = false;
            scanned = true;

            const transformedPerspective = transformPerspective(src, contourDetails, edgeRatio);
            const improvedSharpness = improveSharpness(transformedPerspective);
            
            // cv.resize(improvedSharpness, improvedSharpness, new cv.Size(0, 0), 0.4, 0.4, cv.INTER_AREA);
            
            const target = new cv.Mat();
            improvedSharpness.convertTo(target, cv.CV_8U);

            cv.imshow(scannedDocument, target);
            //cv.imshow(scannedDocument, transformedPerspective);

            target.delete();
            improvedSharpness.delete();
            transformedPerspective.delete();

            $('#overlay').hide();
            $('#videoInput').hide();
            $('#scannedDocument').show();

            const result = await Tesseract.recognize(
                scannedDocument, 'deu+eng', {
                    langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
                    logger: m => console.log(m)
                },
                { logger: m => console.log(m) });

            console.log(result);
            alert(result.data.text);
        }

        src.delete();
    });

    const edgeDetectionVideo = document.getElementById('edgeDetectionVideo');
    const video = document.getElementById('videoInput');
    const processingVideo = document.getElementById('processingVideo');
    
    // Fill devices selection
    const devicesSelect = $('#devices');
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(x => x.kind === 'videoinput');

    videoDevices.forEach(x => devicesSelect.append($("<option />").val(x.deviceId).text(x.label)));
    
    let streaming = false;
    let timer = null;
    let stream = null;

    const flashButton = $('#flash-button');
    flashButton.click(function () {
        const isEnabled = flashButton.val() === true;

        const track = stream.getVideoTracks()[0];

        track.applyConstraints({
            advanced: [{torch: !isEnabled}]
        });

        flashButton.val(!isEnabled);

        flashButton.text(isEnabled ? 'Flash: Activate' : 'Flash: Deactivate');
    });

    devicesSelect.change(async function () {
        devicesSelect.hide();
        
        streaming = false;
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;         
        }

        if (timer) {
            clearTimeout(timer);
        }
        
        const selectedValue = devicesSelect.val();

        if (selectedValue === 'choose')
            return;

        stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                deviceId: { exact: selectedValue },
                facingMode: { ideal: 'environment' },
                width: { ideal: 4096 },
                height: { ideal: 2160 }
            },
            audio: false 
        });
        
        video.srcObject = stream;
        video.play();

        processingVideo.srcObject = stream;
        processingVideo.play();

        edgeDetectionVideo.srcObject = stream;
        edgeDetectionVideo.play();

        const track = stream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(track);
        const photoCapabilities = await imageCapture.getPhotoCapabilities();

        
        $('#scan-button').show();
        $('#flash-button').show();

        streaming = true;

        // Logging stuff
        console.log('Track caps', stream.getVideoTracks()[0].getCapabilities());
        console.log('Track constraints', stream.getVideoTracks()[0].getConstraints());
        console.log('Track settings', stream.getVideoTracks()[0].getSettings());
        console.log('Photo caps', photoCapabilities);

        const overlay = document.getElementById('overlay');
        
        const streamSettings = stream.getVideoTracks()[0].getSettings();
        const canvasHeight = $('.video-view').height();
        const canvasWidth = $('.video-view').width();

        ratio = getRatio(
            { width: streamSettings.width, height: streamSettings.height },
            { width: canvasWidth, height: canvasHeight });
        
        video.height = streamSettings.height * ratio;
        video.width = streamSettings.width * ratio;

        overlay.height = video.height;
        overlay.width = video.width;

        processingVideo.height = streamSettings.height;
        processingVideo.width = streamSettings.width;

        edgeRatio = getRatio(
            { width: streamSettings.width, height: streamSettings.height },
            { width: 300, height: 300 });

        edgeDetectionVideo.height = streamSettings.height * edgeRatio;
        edgeDetectionVideo.width = streamSettings.width * edgeRatio;

        const overlayRatio = getRatio(
            { width: edgeDetectionVideo.width, height: edgeDetectionVideo.height },
            { width: overlay.width, height: overlay.height });

        const src = new cv.Mat(edgeDetectionVideo.height, edgeDetectionVideo.width, cv.CV_8UC4);
        const cap = new cv.VideoCapture(edgeDetectionVideo);

        const FPS = streamSettings.frameRate;

        function processVideo() {
            if (!streaming)
            {
                // src.delete();
                return;
            }

            let begin = Date.now();
            // start processing.
            cap.read(src);
            
            // const tempContourDetails = getContourDetails(src, edges => cv.imshow(overlay, edges));
            const tempContourDetails = getContourDetails(src, edges => {});

            if (tempContourDetails !== null) {
                contourDetails = tempContourDetails;
            }

            if (contourDetails) {
                // cv.imshow(overlay, src);
                drawPoints(contourDetails, overlay, overlayRatio);
            }

            // schedule processing
            // let delay = 1000/FPS - (Date.now() - begin);
            let delay = 500 - (Date.now() - begin);
            timer = setTimeout(processVideo, delay);
        };

        timer = setTimeout(processVideo, 0);
    });
});