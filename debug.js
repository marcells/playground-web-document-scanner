$(async function() {
    const devicesSelect = $('#devices');
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(x => x.kind === 'videoinput');

    videoDevices.forEach(x => devicesSelect.append($("<option />").val(x.deviceId).text(x.label)));

    devicesSelect.change(async () => await go(devicesSelect.val()));
});

async function go() {
    const selectedValue = $('#devices').val();

    if (selectedValue === 'choose')
        return;
    
    const video = document.getElementById('videoInput');
    const debugPreviewEdges = document.getElementById('debugPreviewEdges');
    const debugPreviewArea = document.getElementById('debugPreviewArea');
    const debugPreviewTransformedPerspective = document.getElementById('debugPreviewTransformedPerspective');
    const preview = document.getElementById('preview');

    const src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    const dst = new cv.Mat(video.height, video.width, cv.CV_8UC1);
    const cap = new cv.VideoCapture(video);

    let streaming = false;

    const FPS = 30;
    function processVideo() {
        if (!streaming) {
            src.delete();
            dst.delete();
            return;
        }
        let begin = Date.now();
        // start processing.
        cap.read(src);
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        
        const contourDetails = getContourDetails(src, edges => cv.imshow(debugPreviewEdges, edges));

        if (contourDetails) {
            // cv.imshow(debugPreviewArea, src);
            // drawContour(contourDetails, debugPreviewArea);
            drawPoints(contourDetails, debugPreviewArea);

            // recognized Points could be modified/corrected by the user here

            const transformedPerspective = transformPerspective(src, contourDetails);
            cv.imshow(debugPreviewTransformedPerspective, transformedPerspective);

            const improvedSharpness = improveSharpness(transformedPerspective);
            cv.imshow(preview, improvedSharpness);

            improvedSharpness.delete();
            transformedPerspective.delete();
        }

        // schedule processing
        let delay = 1000/FPS - (Date.now() - begin);
        setTimeout(processVideo, delay);
    };

    const stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                deviceId: { exact: selectedValue } 
            },
            audio: false 
        });
    
    video.srcObject = stream;
    video.play();

    streaming = true;
    setTimeout(processVideo, 0);
}