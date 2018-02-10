(global => {

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

    const kvreduce = (f,init,o) => {

	let accum = o || init;

	return Object.keys(accum).reduce((i, k) => f(i,k,accum[k]), init || {});

    }

    const throwError = msg => { throw new Error(msg) };

    /* Compiler */

    const primitives = new Set(["rect", "circle", "text", "g"]);

    const shapeApply = (fns,s) => (fns[s.shape])(s);

    const offsetRect = s => {

	let {cx,cy,x,y,width,height} = s;

	let shape = dissoc(s, "cx", "cy");

	if(cx != null) shape = merge(shape, {x: x || cx - width/2});

	if(cy != null) shape = merge(shape, {y: y || cy - height/2});

	return shape;
	
    };

    const normalizeCircle = c => c;

    const normalizeRect = c => offsetRect(renameKeys(c, {w: "width", h: "height"}));

    const normalizeText = t => t;

    const normalizeGroup = g => g;

    const normalizers = {circle: normalizeCircle, rect: normalizeRect, text: normalizeText, g: normalizeGroup};

    const transformStr = (k,vs) => {

	let keys = new Set(["translate", "rotate", "scale"]);

	return keys.has(k) && vs && vs.every(x => x != null) ? (k + "(" + vs.join(",") + ")") : "";

    }

    const normalizeTransform = sh => {

	let {translateX, translateY} = sh;

	if(translateX || translateY) { sh = merge(sh,{translate: [translateX || 0, translateY || 0]}) };

	const transformStrs = map(([k,v]) => transformStr(k,[].concat(v)), Object.entries(sh));

	let shape = dissoc(sh, "translate", "rotate", "scale", "translateX", "translateY");

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

	const svgAttrs = new Set(["class", "cx", "cy", "dx", "dy", "fill", "height", "id",
				  "opacity", "r", "rx", "ry", "stroke", "stroke-dasharray",
				  "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
				  "stroke-miterlimit", "stroke-opacity", "stroke-width", "transform",
				  "text-anchor", "lengthAdjust", "textLength", "style",
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

    const genText = t => {

	const node = svgNode(t.shape, dissoc(t, "contents"));

	node.textContent = t.contents;

	return node;
	
    }

    const genGroup = g => {

	const node = svgNode(g.shape, g);

	for(let child of g.contents) node.appendChild(compile(child));

	return node;

    };

    const generators = {circle: genShape, rect: genShape, text: genText, g: genGroup};

    const generateEntity = s => shapeApply(generators, s);

    const compile = s => primitives.has(s["shape"]) ? generateEntity(parseEntity(s)) : throwError("Parse Error: Unknown Shape");

    /* API */

    const circle = attrs => merge({shape: "circle"}, attrs);

    const rect = attrs => merge({shape: "rect"}, attrs);

    const text = (text, attrs) => merge({shape: "text", contents: text || ""}, attrs);

    const g = (contents = null, attrs) => merge({shape: "g", contents: [].concat(contents || [])}, attrs);

    const rgba = (r=0,g=0,b=0,a=1) => ({colorspace: "rgb", r,g,b,a});

    const translate = (x,v) => merge(x, {translate: v});

    const rotate = (x,v) => merge(x, {rotate: v});

    const scale = (x,v) => merge(x, {scale: v});

    const gmap = (f,g,v) => merge(g, {contents: map(f,g.contents,isArr(v) ? v : repeat(v,g.contents.length))});
    
    const parametrize = (xs,k,attrs) => {

	if(isArr(attrs)) {

	    return gmap(merge,repeat(xs,attrs.length),map(x => ({[k]: x}), attrs));

	} else if(xs["shape"] == "g") return gmap(merge,xs,{[k]: attrs});

	else return merge(xs,{[k]: attrs});

    }

    const sample = (xs,k,attrs) => {

	if(typeof(attrs) === "function") return sample(xs,k,attrs(xs.contents.length))

	else return gmap(merge,xs,isArr(attrs)? map(x => ({[k]: x}), attrs) : ({[k]: attrs}));

    }

    const row = (s,dist) => parametrize(s, ({circle: "cx", rect: "x", g: "translateX"})[s.shape], dist);

    const col = (s,dist) => parametrize(s, ({circle: "cy", rect: "y", g: "translateY"})[s.shape], dist);

    const grid = (shape,rowDist,colDist) => row(col(shape,colDist || rowDist), rowDist);

    const ring = (node, r = 10, count, loc) => {

	const circlePoint = (angle,r,loc) => [Math.sin(angle) * r + loc[0], Math.cos(angle) * r + loc[1]];

	const ringPoints = (count, r, loc) => map(i => circlePoint((Math.PI * 2/count) * i,r,loc), range(0,count-1));

	count = count || 10, loc = !isArr(loc) && [0,0] || loc;

	return parametrize(node, "translate", ringPoints(count, r, loc));

    }

    const render = (canvas,s) => (canvas.appendChild(compile(s)), s);

    const surface = attrs => {

	let s = svgNode("svg", attrs);

	s.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns", "http://www.w3.org/2000/svg");

	return s;

    }

    const radToDeg = x => (180/Math.PI) * x;

    const setGlobals = () => kvreduce((i,k,v) => global[k] = v ,{}, exports);

    const exports = {circle, rect, text, g, rgba, render, repeat, translate, rotate, scale, range, steps, sample, parametrize, gmap, row, col, grid, ring, radToDeg, surface, setGlobals};

    global.y = exports;

    if(typeof module !== "undefined" && module.exports) module.exports = exports;

})(this);
