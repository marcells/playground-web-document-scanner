function getContourDetails(source, onEdgesFound) {
    const edges = new cv.Mat();
    const gray = new cv.Mat();
    const blurred = new cv.Mat();

    cv.cvtColor(source, gray, cv.COLOR_BGR2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 100, 200);

    onEdgesFound(edges);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    
    edges.delete();
    gray.delete();
    blurred.delete();
    hierarchy.delete();

    const contoursWithArea = [];
    for(let i=0; i < contours.size(); i++) {
        const contour = contours.get(i);
        
        contoursWithArea.push({
            contour,
            area: cv.contourArea(contour),
        });
    }

    contoursWithArea.sort((a,b)=> b.area - a.area);

    for(let i=0; i < contoursWithArea.length; i++) {
        const { contour } = contoursWithArea[i];
        const approx = new cv.Mat();

        const peri = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        // Extract points from contour
        const points = [];
        const pointsData = approx.data32S;

        for (let index = 0; index < pointsData.length; index += 2){
            points.push({
                x: pointsData[index],
                y: pointsData[index + 1]
            });
        }

        // Check if we found at least four points
        if (points.length < 4)
            continue;

        // detect corner points
        const classifiedPoints = classifyPoints(points);
        const alignedPoints = [ classifiedPoints.tl, classifiedPoints.tr, classifiedPoints.br, classifiedPoints.bl ];

        // if the corner points could be classified
        if (alignedPoints.every(point => point !== null)) {
            contours.delete();

            return {
                contour: approx,
                points: alignedPoints,
            };
        }
    }

    return null;
}

function drawPoints(contourDetails, canvas, ratio) {
    let context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    let { points } = contourDetails;

    if (ratio) {
        points = points.map(point => ({
            x: point.x * ratio,
            y: point.y * ratio,
        }));
    }

    for(var i=0; i < points.length; i++) {
        var circle = points[i];
 
        context.globalAlpha = 0.85;
        context.beginPath();
        context.arc(circle.x, circle.y, 5, 0, Math.PI*2);
        context.fillStyle = "yellow";
        context.strokeStyle = "yellow";
        context.lineWidth = 5;
        context.fill();
        context.stroke();

        // Line between current and next point (last point connects to first)
        const nextPointCenter = i === points.length - 1 ? points[0] : points[i + 1];
        context.beginPath();
        context.moveTo(circle.x, circle.y);
        context.lineTo(nextPointCenter.x, nextPointCenter.y);
        context.stroke();
        
      }
}

function drawContour(contourDetails, canvas) {
    // Draw contour
    let vector = new cv.MatVector();
    vector.push_back(contourDetails.contour);

    const contourOutput = cv.Mat.zeros(canvas.height, canvas.width, cv.CV_8UC3);
    cv.drawContours(contourOutput, vector, -1, new cv.Scalar(0, 255, 0), 2);
    cv.imshow(canvas, contourOutput);

    return;
}

function classifyPoints(points) {
    const minX = Math.min(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxX = Math.max(...points.map(point => point.x));
    const maxY = Math.max(...points.map(point => point.y));

    const middleX = (maxX - minX) / 2 + minX;
    const middleY = (maxY - minY) / 2 + minY;

    const findPointInArea = (fromX, fromY, toX, toY) => {
        const foundPoint = points.filter(point => point.x >= fromX && point.x <= toX && point.y >= fromY && point.y <= toY);

        if (foundPoint.length == 0 || foundPoint.length > 1)
            return null;

        return foundPoint[0];
    };

    return {
        tl: findPointInArea(minX, minY, middleX, middleY),
        bl: findPointInArea(middleX, minY, maxX, middleY),
        tr: findPointInArea(minX, middleY, middleX, maxY),
        br: findPointInArea(middleX, middleY, maxX, maxY),
    };
}

function transformPerspective(source, contourDetails, ratio) {
    let { points } = contourDetails;
    
    if (ratio) {
        points = points.map(point => ({
            x: point.x / ratio,
            y: point.y / ratio,
        }));
    }

    const { tl, bl, tr, br } = classifyPoints(points);

    if (tl == null || bl == null || tr == null || br == null)
        return source.clone();

    const height = Math.max(
        Math.sqrt((br.x-bl.x)**2 + (br.y-bl.y)**2),
        Math.sqrt((tr.x-tl.x)**2 + (tr.y-tl.y)**2),
    );

    const width = Math.max(
        Math.sqrt((tr.x-br.x)**2 + (tr.y-br.y)**2),
        Math.sqrt((tl.x-bl.x)**2 + (tl.y-bl.y)**2),
    );

    const from = cv.matFromArray(4, 1, cv.CV_32FC2, [ tl.x, tl.y, bl.x, bl.y, tr.x, tr.y, br.x, br.y]);
    const to = cv.matFromArray(4, 1, cv.CV_32FC2, [ 0, 0, width-1, 0, 0, height-1, width-1, height-1]);
    const M = cv.getPerspectiveTransform(from, to);
    
    const out = new cv.Mat();
    const size = new cv.Size();
    size.width = width;
    size.height = height;

    cv.warpPerspective(source, out, M, size);

    return out;
}

function improveSharpness(source) {
    let destination = new cv.Mat();
    
    cv.cvtColor(source, source, cv.COLOR_RGBA2GRAY, 0);    
    cv.GaussianBlur(source, destination, new cv.Size(7, 7), 0);
    cv.adaptiveThreshold(destination, destination, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    return destination;
}

function getRatio(actualSize, desiredSize) {
    const ratioX = desiredSize.width / actualSize.width;
    const ratioY = desiredSize.height / actualSize.height;
    ratio = ratioX < ratioY ? ratioX : ratioY;

    return ratio;
}