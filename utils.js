function getContourDetails(source, onEdgesFound) {
    const edges = new cv.Mat();
    const gray = new cv.Mat();
    const blurred = new cv.Mat();

    cv.cvtColor(source, gray, cv.COLOR_BGR2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 5);
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

        // Check if we found exactly four corner points
        if (points.length === 4) {
            contours.delete();

            return {
                contour: approx,
                points
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
            x: point.x *= ratio,
            y: point.y *= ratio,
        }));
    }

    for(var i=0; i < points.length; i++) {
        var circle = points[i];
 
        context.globalAlpha = 0.85;
        context.beginPath();
        context.arc(circle.x, circle.y, 5, 0, Math.PI*2);
        context.fillStyle = "yellow";
        context.strokeStyle = "yellow";
        context.lineWidth = 10;
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(circle.x, circle.y);
        context.lineTo( points[i-1>=0?i-1:3].x,  points[i-1>=0?i-1:3].y);
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
    const minX = Math.min(points[0].x, points[1].x, points[2].x, points[3].x);
    const minY = Math.min(points[0].y, points[1].y, points[2].y, points[3].y);
    const maxX = Math.max(points[0].x, points[1].x, points[2].x, points[3].x);
    const maxY = Math.max(points[0].y, points[1].y, points[2].y, points[3].y);

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
            x: point.x /= ratio,
            y: point.y /= ratio,
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
    // const kernel = cv.matFromArray(3,3,cv.CV_32FC1, [-1, 0, 1, -2 , 0, 2, -1 ,0 ,1]);
    // cv.filter2D(source, source, -1, kernel);
    cv.adaptiveThreshold(source, destination, 400, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 3, 2);

    return destination;
}

function getRatio(actualSize, desiredSize) {
    const ratioX = desiredSize.width / actualSize.width;
    const ratioY = desiredSize.height / actualSize.height;
    ratio = ratioX < ratioY ? ratioX : ratioY;

    return ratio;
}