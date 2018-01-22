((global) => {

    "use strict";

    /* Core */

    const merge = (...x) => Object.assign({},...x);
    
    const dissoc = (s,...props) => reduce((init,next) => (delete init[next], init), merge({},s), props);

    const renameKeys = (m,keymap = {}) => kvreduce((_,k,v) => ((k in m) && (m[v] = m[k], delete m[k]), m), keymap);

    const isArr = Array.isArray;

    const isColor = x => x && Object.prototype.hasOwnProperty.call(x, "colorspace");

    const isShape = x => x && Object.prototype.hasOwnProperty.call(x, "shape")

    const transpose = colls => {

        let repetition = Math.min(...map(x => x.length, colls));

        return map(i => map(x => x[i], colls), range(0,repetition - 1));
        
    }

    const repeat = (obj, times) => {

        let reps = map(() => obj, new Array(times || 0));

        return isShape(obj) && reps.length > 0 ? g(reps) : reps;
        
    }

    const repeatedly = (f, times) => {

        let reps = map(() => f(), new Array(times || 0));

        return isShape(f()) && reps.length > 0 ? g(reps) : reps;
        
    }

    const range = (from, to, step) => {

        step = step || 1;

        if(!to) { to = from; from = 0;}

        const r = [];

        for(let i = from; i <= to; i+= step) r.push(i);

        return r;

    };

    const parseColorStr = st => {

        let span = document.createElement("span");

        document.body.appendChild(span);

        span.style.color = st;

        let color = getComputedStyle(span).color;

        document.body.removeChild(span);

        let parsedColor = color.match(/\((.*)\)/)[1].split(",").map(Number);

        if (parsedColor) return rgba(...parsedColor); else throwError("No Color Found");
        
    };

    const colorSteps = (from, to, count) => {

        let {r, g, b, a} = parseColorStr(from), {r:toR, g:toG,b:toB, a:toA} = parseColorStr(to);

        return map(rgba, steps(+r,+toR, count), steps(+g, +toG, count), steps(+b, +toB, count), steps(+a, +toA, count));

    };

    const steps = (from,to,count) => {

        if(count == null) return n => steps(from,to,n);

        if(typeof(from) === "string" && typeof(to) === "string") return colorSteps(from,to,count);

        from = +from, to = +to;

        if(count <= 1) return [from];

        count = count - 1;

        const r = [], step = 1/count, magnitude = Math.abs(to - from);

	for(let i = 0; i <= count; i++) {

	    let progress = i * step, direction = (from < to) ? 1 : -1;

	    r.push(from + magnitude * progress * direction);

	}

	return r;

    };

    const reduce = (f,init,coll) => {

        if(!coll) { coll = init.slice(1); init = init[0];}

        for(let i = 0; i < coll.length; i++) init = f(init,coll[i]);

        return init;

    };
    
    const map = (f,coll,coll2,...colls) => {

        let res = [], count = null;

        if(colls.length > 0) {

	    const bigColl = [coll,coll2].concat(colls);

	    return map(x => f.apply(null,x), transpose(bigColl));

        } else {

            count = coll2 ? Math.min(coll.length, coll2.length) : coll.length;

	    for(let i = 0; i < count; i++) {

	        (!coll2) ? res.push(f(coll[i])) : res.push(f(coll[i], coll2[i]));

            }

        }

        return res;

    };

    const mapidx = (f, ...colls) => {

        let min = Math.min(...map(x => x.length, colls));

        return map(f,range(0,min) ,...colls);
        
    }

    const kvreduce = (f,init,o) => {

        let accum = o || init;

        return Object.keys(accum).reduce((i, k) => f(i,k,accum[k]), init || {});

    }

    const throwError = msg => { throw new Error(msg) };

    /* Compiler */

    const primitives = new Set(["rect", "circle", "ellipse", "line", "polygon", "roundedPolygon", "polyline", "path", "g", "clipPath", "mask"]);

    const shapeApply = (fns,s) => (fns[s.shape])(s);

    const offsetRect = s => {

        let {cx,cy,x,y,width,height} = s;

        let shape = dissoc(s, "cx", "cy");

        if(cx != null) shape = merge(shape, {x: x || cx - width/2});

        if(cy != null) shape = merge(shape, {y: y || cy - height/2});

        return shape;
        
    };

    const normalizeCircle = c => c;

    const normalizeEllipse = c => c;

    const normalizePolygon = p => {

        let {points} = p;

        return (isArr(points) ? merge(p, {points: points.join(" ")}) : p);

    }

    const buildRoundedPolygon = attrs => {

        let {x = 0,y = 0, width, r, sides = 3} = attrs;

        const radius = width/Math.sqrt(3);
        
        // Should I name these cx and cy?
        let loc = [x,y];

        let points = ringPoints(radius,sides,loc, 90);

        let pairs = partition(cycleHead(points, 1, true), 2,1);

        let result = [];

        for(let [v1,v2] of pairs) {

            let rrVec = vMul(vUnit(vSub(v2,v1)), r);

            result = result.concat([[v1, vAdd(v1,rrVec), vSub(v2,rrVec)]]);
            
        }


        let [q1,q2,m] = result[result.length - 1];

        let str = result.map(([q1,q2,l]) => `Q${q1} ${q2} L ${l}`);

        let pathString = `M ${m} ${str} Z`;

        return path(merge({d: pathString}, dissoc(attrs, "shape")));

    }

    const normalizePolyline = p => {

        let {points} = p;

        return (isArr(points) ? merge(p, {points: points.join(" ")}) : p);

    }

    const normalizeRect = c => offsetRect(renameKeys(c, {w: "width", h: "height"}));

    const normalizeLine = l => {

        let {start, end} = l;

        let newL = dissoc(l, "start", "end");

        if(start && end) {

            let [x1,y1] = start, [x2,y2] = end;

            return merge(newL, {x1,y1,x2,y2});

        } else {

            return newL;

        }
    }

    const normalizePath = p => p;

    const normalizeGroup = g => g;

    const normalizeClipPath = p => p;

    const normalizeMask = p => p;

    const normalizers = {circle: normalizeCircle, ellipse: normalizeEllipse, rect: normalizeRect, g: normalizeGroup, line: normalizeLine, polygon: normalizePolygon, roundedPolygon: buildRoundedPolygon, polyline: normalizePolyline, path: normalizePath, clipPath: normalizeClipPath, mask: normalizeMask};

    const transformStr = (k,vs) => {

        let keys = new Set(["translate", "rotate", "scale"]);

        return keys.has(k) && vs && vs.every(x => x != null) ? (k + "(" + vs.join(",") + ")") : "";

    }

    const normalizeTransform = sh => {

        let {translateX, translateY} = sh;

        if(translateX || translateY) { sh = merge(sh,{translate: [translateX || 0, translateY || 0]}) };

        const transformStrs = kvreduce((i,k,v) => (i.push(transformStr(k,[].concat(v))), i), [], sh);

        const shape = dissoc(sh, "translate", "rotate", "scale", "translateX", "translateY", "skewX", "skewY");

        const trsStr = transformStrs.join(" ").trim();

        return trsStr ? merge(shape,{transform: trsStr}) : shape;
        
    };

    const normalizeColor = sh => {

        let {fill, stroke} = sh;

        const rgbaStr = ({r=0,g=0,b=0,a=1}) => "rgba(" + map(Math.round, [r,g,b,a]).join(",") + ")";

        const toRGBA = x => isColor(x) ? rgbaStr(x) : x;

        fill = toRGBA(fill), stroke = toRGBA(stroke);

        return merge(sh, fill && {fill}, stroke && {stroke});
        
    };
    
    const parseEntity = s => normalizeColor(normalizeTransform(shapeApply(normalizers,s)));

    const setSVGAttrs = (el,attrs) => {

        const svgAttrs = new Set(["class", "cx", "cy", "clip-path", "mask", "d", "fill", "fill-rule", "fill-opacity", "height", "id",
                                  "opacity", "points", "r", "rx", "ry", "skewX", "skewY", "stroke", "stroke-dasharray",
                                  "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
                                  "stroke-miterlimit", "stroke-opacity", "stroke-width", "transform", "transform-origin",
                                  "width", "x", "x1", "x2", "y", "y1", "y2", "viewBox"]);
        
        const camelToKebab = s => s.replace(/([A-Z])/g, "-$1").toLowerCase();

        const setSVGAttr = (el,k,v) => {

            let svgKey = (k === "viewBox") ? k : camelToKebab(k);
            
            return svgAttrs.has(svgKey) ? (el.setAttribute(svgKey,v),el) : el;

        }

        return kvreduce(setSVGAttr, el, attrs);

    };

    const svgNode = (tag,attrs) => setSVGAttrs(document.createElementNS("http://www.w3.org/2000/svg", tag), attrs);

    const genShape = sh => svgNode(sh.shape, sh);

    const genComposite = g => {

        const node = svgNode(g.shape, g);

        for(let child of g.contents) node.appendChild(compile(child));

        return node;

    };

    const postGen = (attrs,node) => {

        if(attrs.hasOwnProperty("origin")) {
            node.style.transformBox = "fill-box";
            node.style.transformOrigin = attrs.origin;
        }

        return node;
        
    }

    const generateEntity = s => (s["shape"] == "g" || s["shape"] == "mask") ? genComposite(s) : genShape(s);

    const compile = s => primitives.has(s["shape"]) ? postGen(s,generateEntity(parseEntity(s))) : throwError("Parse Error: Unknown Shape");

    /* API */

    const vAdd = ([x1,y1], [x2,y2]) => [x1 + x2, y1 + y2];

    const vSub = ([x1,y1], [x2,y2]) => [x1 - x2, y1 - y2];

    const vMul = ([x,y], m) => [x * m, y * m];

    const vDiv = ([x,y], m) => [x / m, y / m];

    const vMag = ([x,y]) => Math.sqrt(x * x + y * y);

    const vUnit = v => {

        let mag = vMag(v);

        return mag == 0 ? [0,0] : vDiv(v, mag);

}

    const circlePoint = (angle, r, loc = [0,0]) => vAdd(loc, vMul([Math.cos(angle), Math.sin(angle)],r));

    const ringPoints = (r, count, loc = [0,0], offset = 0) => map(i => circlePoint(((Math.PI * 2/count) * i + ((Math.PI / 180)) * offset),r,loc), range(0,count-1));

    const circle = attrs => merge({shape: "circle"}, attrs);

    const ellipse = attrs => merge({shape: "ellipse"}, attrs);

    const rect = attrs => merge({shape: "rect"}, attrs);

    const capsule = attrs => rect(merge(attrs, {rx: (Math.min(attrs.width, attrs.height) || 0)/2}));

    const regPoly = attrs => {

        let {x = 0, y = 0,width = 10, sides = 3, r = 0} = attrs;

        return (r === 0) ? polygon({points: ringPoints(width,sides,[x,y])}) : merge({shape: "roundedPolygon"}, attrs);

    }

    const line = attrs => merge({shape: "line"}, attrs);

    const polygon = attrs => merge({shape: "polygon"}, attrs);

    const polyline = attrs => merge({shape: "polyline"}, attrs);

    const path = attrs => merge({shape: "path"} ,attrs);

    const clipPath = (content = null, attrs) => merge({shape: "clipPath", contents: [].concat(content || [])}, attrs);

    const mask = (content = null, attrs) => merge({shape: "mask", contents: [].concat(content || [])}, attrs);

    const g = (contents = null, attrs) => merge({shape: "g", contents: [].concat(contents || [])}, attrs);

    const rgba = (r=0,g=0,b=0,a=1) => ({colorspace: "rgb", r,g,b,a});

    const translate = (x,v) => merge(x, {translate: v});

    const rotate = (x,v) => merge(x, {rotate: v});

    const scale = (x,v) => merge(x, {scale: v});

    const reflect = (x,k = "x") => merge(x, {scale: ({x: [-1,1], y: [1,-1]})[k]});

    const mirror = (x,k = "x") => g([x,reflect(x, k)]);

    const gmap = (f,g,v) => merge(g, {contents: map(f,g.contents,isArr(v) ? v : repeat(v,g.contents.length))});
    
    const parametrizeOn = (xs,k,attrs) => {

        if(isArr(attrs)) {

            return gmap(merge,repeat(xs,attrs.length),map(x => ({[k]: x}), attrs));

        } else if(xs["shape"] == "g") return gmap(merge,xs,{[k]: attrs});

        else return merge(xs,{[k]: attrs});

    }

    const parametrizeIn = (xs,k,attrs) => {

        if(typeof(attrs) === "function") return parametrizeOn(xs,k,attrs(xs.contents.length))

        else return gmap(merge,xs,isArr(attrs)? map(x => ({[k]: x}), attrs) : ({[k]: attrs}));

    }

    // Randomize: Should I parametrize? What about when group is passed?
    const randomizeOn = (xs,k,{bounds, count = 1, seed, asInt}) => parametrizeOn(xs, k, random(bounds[0], bounds[1], {count, seed, asInt}));

    const randomizeIn = (xs,k,{bounds, count = 1, seed, asInt}) => parametrizeIn(xs, k, random(bounds[0], bounds[1], {count, seed, asInt}));

    const row = (s,dist) => parametrize(s, "translateX", dist);

    const col = (s,dist) => parametrize(s, "translateY", dist);

    const grid = (shape,rowDist,colDist) => row(col(shape,colDist || rowDist), rowDist);

    const ring = (node, r = 10, count = 10, loc = [0,0]) => parametrizeOn(node, "translate", ringPoints(r, count, loc));

    const random = (min, max, attrs = {}) => {

        if(max == null) { max = min; min = 0};

        let {asInt, seed = Date.now() + Math.random() * 1000000, count = 1} = attrs;

        const distributor = 2 ** 13 + 1;

        const prime = 1987;

        const threshold = 2 ** 32;

        const rnd = (seed) => ((seed * distributor) + prime) % threshold;

        let res = [];

        let nextSeed = seed;

        for(let i = 0; i < count; i++) {

            let num = rnd(nextSeed);

            nextSeed = num;

            let normalized = num / threshold;

            let val = min + normalized * (max - min);
            
            res.push(asInt ? Math.round(val) : val);
        }

        return (count == 1) ? res[0] : res;
        
    }

    const render = (canvas,s) => {

        let el = compile(s);

        canvas.appendChild(el);

        return el;
    }

    const def = (canvas, defn) => {

        let el = compile(defn);

        let defs = canvas.querySelector("defs") || canvas.appendChild(svgNode("defs"));

        defs.appendChild(el);

        return el;
        
    }

    const centerCanvas = (canvas) => {

        let {width, height} = canvas.getBoundingClientRect();

        let viewBox = `${-width/2} ${-height/2} ${width} ${height}`;

        canvas.setAttribute("viewBox", viewBox);
        
    }

    const centerOrigin = (el) => {

        el.style.transformBox = "fill-box";
        el.style.transformOrigin = "center";

    }

    const surface = attrs => {

        let s = svgNode("svg", attrs);

        s.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns", "http://www.w3.org/2000/svg");

        return s;

    }

    const radToDeg = x => (180/Math.PI) * x;

    const setGlobals = () => kvreduce((i,k,v) => global[k] = v ,{}, api);

    const api = {circle, rect, capsule, polygon, regPoly, polyline, path, clipPath, mask, g, rgba, render, repeat, repeatedly, translate, rotate, scale, range, steps, parametrizeOn, parametrizeIn, randomizeIn, gmap, row, col, grid, ringPoints, ring, radToDeg, random, surface, map, def, centerOrigin, centerCanvas, isShape};

    global.mandala = merge(api, {setGlobals});

    if(typeof module !== "undefined" && module.exports) {
        module.exports = mandala;
    }

})(this);

