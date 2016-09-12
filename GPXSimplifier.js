// Requires
const gpxParse = require('gpx-parse');
var fs = require('fs');
var readline = require('readline');

// Filenames of the gpx files
var inFilename = process.argv[2];
var outFilename = process.argv[3];

// Output string to write in the file
var out = "";

// Utilities function to check the emptiness of a string
function empty(a) {
    a = visible(a);
    for (var i = 0; i < a.length; i++) {
        if (a[i] != ' ') return false
    }
    return  true
}

function visible(a) {
    var r = '';
    for (var i = 0; i < a.length; i++) {
        if (a[i] == '\b') { r -= 1; continue; }
        if (a[i] == '\u001b') {
            while (a[i] != 'm' && i < a.length) i++;
            if (a[i] == undefined) break
        }
        else r += a[i];
    }
    return r;
}

// Gets the gpx header to write simplified file
readline.createInterface({
    input: fs.createReadStream(inFilename),
    terminal : false
}).on('line', function(line) {
    if (!line.includes("trkseg") && !line.includes("ele") && !line.includes("time") && !line.includes("trkpt") && !empty(line)) {
        out += line + '\n';
    }
});

// Get a collection of waypoints, tracks, segments and points from the gpx file
gpxParse.parseGpxFromFile(inFilename, function (error, data) {
    if (error) {
        console.log(error)
    } else {
        for (trackNum = 0; trackNum < data.tracks.length; trackNum++) {
            var track = data.tracks[trackNum];
            for (segmentNum = 0; segmentNum < track.segments.length; segmentNum++) {
                var segment = track.segments[segmentNum];
                var points = [];
                for (pointNum = 0; pointNum < segment.length; pointNum++) {
                    //noinspection JSDuplicatedDeclaration
                    var tmPoint = segment[pointNum];
                    tmPoint.lat *= 100;
                    tmPoint.lon *= 100;
                    points.push(tmPoint);
                }
            }
        }
        // Loop until we get only 50 points
        do {
            points = simplify(points);
        } while (points.length > 50);
        // Rebuilds the simplified gpx
        out += '<trkseg>\n';
        for (pointNum = 0; pointNum < points.length; pointNum++) {
            //noinspection JSDuplicatedDeclaration
            var tmPoint = points[pointNum];
            var time = new Date(point.time).toISOString();
            out += '<trkpt lat="' + tmPoint.lat + '" lon="' + tmPoint.lon
                + '"\n\n<time>' + time + '</time>\n'
                + '<ele>' + tmPoint.elevation + '</ele></trkpt>\n';
        }
        out += '</trkseg>\n</trk>\n</gpx>';
        fs.writeFile(outFilename, out, function(err) {
            if(err) {
                return console.log(err);
            }
        });
    }

    function getSqDist(p1, p2) {
        var dx = p1.lat * 100 - p2.lat * 100,
            dy = p1.lon * 100 - p2.lon * 100;
        return dx * dx + dy * dy;
    }

    // Square distance from a point to a segment
    function getSqSegDist(p, p1, p2) {
        var x = p1.lat * 100,
            y = p1.lon * 100,
            dx = p2.lat * 100 - x,
            dy = p2.lon * 100 - y;
        if (dx !== 0 || dy !== 0) {
            var t = ((p.lat - x) * dx + (p.lon - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2.lat * 100;
                y = p2.lon * 100;

            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }
        dx = p.lat * 100 - x;
        dy = p.lon * 100 - y;
        return dx * dx + dy * dy;
    }

    // Basic distance-based simplification
    function simplifyRadialDist(points, sqTolerance) {
        var prevPoint = points[0],
            newPoints = [prevPoint],
            point;
        for (var i = 1, len = points.length; i < len; i++) {
            point = points[i];
            if (getSqDist(point, prevPoint) > sqTolerance) {
                newPoints.push(point);
                prevPoint = point;
            }
        }
        if (prevPoint !== point) newPoints.push(point);
        return newPoints;
    }

    function simplifyDPStep(points, first, last, sqTolerance, simplified) {
        var maxSqDist = sqTolerance,
            index;
        for (var i = first + 1; i < last; i++) {
            var sqDist = getSqSegDist(points[i], points[first], points[last]);
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }
        if (maxSqDist > sqTolerance) {
            if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
            simplified.push(points[index]);
            if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
        }
    }

    // Simplification using Ramer-Douglas-Peucker algorithm
    function simplifyDouglasPeucker(points, sqTolerance) {
        var last = points.length - 1;
        var simplified = [points[0]];
        simplifyDPStep(points, 0, last, sqTolerance, simplified);
        simplified.push(points[last]);
        return simplified;
    }

    // Both algorithms combined for awesome performance
    function simplify(points, tolerance, highestQuality) {
        if (points.length <= 2) return points;
        var sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;
        points = highestQuality ? points : simplifyRadialDist(points, sqTolerance);
        points = simplifyDouglasPeucker(points, sqTolerance);
        return points;
    }
});
