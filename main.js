import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let currentObject;
let currentShape = 'tesseract';

// İki farklı 4D rotasyon ekseni için açılar ve temel hızlar
let rotationAngle4D_yz = 0;
let rotationAngle4D_xw = 0;
const rotationSpeed_yz = 0.005;
const rotationSpeed_xw = 0.0031;

const SHAPES_DATA = {
    tesseract: {
        type: 'lines',
        description: "A Tesseract (4D cube). Starts as a perfect 3D cube. Use the slider to expand it into the 4th dimension, revealing its full hypercube structure through a 4D rotation.",
        points: (() => {
            const points = [];
            for (let i = 0; i < 16; i++) {
                points.push(new THREE.Vector4(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1));
            }
            return points;
        })(),
        edges: [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7],[8,9],[8,10],[8,12],[9,11],[9,13],[10,11],[10,14],[11,15],[12,13],[12,14],[13,15],[14,15],[0,8],[1,9],[2,10],[3,11],[4,12],[5,13],[6,14],[7,15]]
    },
    framed_cube: {
        type: 'lines',
        description: "A visual representation of a tesseract projection where one cube sits inside another. This is a classic stereographic projection model.",
        points: (() => {
            const points = []; const innerScale = 0.5;
            for (let i = 0; i < 8; i++) { points.push(new THREE.Vector4( i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, -1 )); }
            for (let i = 0; i < 8; i++) { points.push(new THREE.Vector4( (i & 1 ? 1 : -1) * innerScale, (i & 2 ? 1 : -1) * innerScale, (i & 4 ? 1 : -1) * innerScale, 1 )); }
            return points;
        })(),
        edges: [[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7],[8,9],[9,11],[11,10],[10,8],[12,13],[13,15],[15,14],[14,12],[8,12],[9,13],[10,14],[11,15],[0,8],[1,9],[2,10],[3,11],[4,12],[5,13],[6,14],[7,15]]
    },
    triangular_pyramid: {
        type: 'lines',
        description: "The 5-Cell (Pentachoron). Starts as a 3D tetrahedron and expands into its 4D form, which consists of 5 tetrahedral cells.",
        points: [
            new THREE.Vector4(1, 1, 1, -1), new THREE.Vector4(1, -1, -1, -1),
            new THREE.Vector4(-1, 1, -1, -1), new THREE.Vector4(-1, -1, 1, -1),
            new THREE.Vector4(0, 0, 0, 1)
        ].map(p => p.multiplyScalar(1.2)),
        edges: [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]]
    },
    octahedron: {
        type: 'lines',
        description: "The 16-Cell (Hexadecachoron). Starts as a 3D octahedron and expands to reveal its full 4D structure, composed of 16 tetrahedral cells.",
        points: [
            new THREE.Vector4(1.5,0,0,0), new THREE.Vector4(-1.5,0,0,0),
            new THREE.Vector4(0,1.5,0,0), new THREE.Vector4(0,-1.5,0,0),
            new THREE.Vector4(0,0,1.5,0), new THREE.Vector4(0,0,-1.5,0),
            new THREE.Vector4(0,0,0,1.5), new THREE.Vector4(0,0,0,-1.5)
        ],
        edges: (() => { const e=[];for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(Math.floor(i/2)!==Math.floor(j/2))e.push([i,j]);return e; })()
    },
    sphere: {
        type: 'points',
        description: "A Glome (3-sphere). Starts as a perfect 3D sphere. Use the slider to expand it into the 4th dimension, creating a hypersphere.",
        points: (() => {
            const points = []; const scale = 1.8;
            for(let i = 0; i < 3000; i++){
                let u=Math.random(), v=Math.random(), theta=2*Math.PI*u, phi=Math.acos(2*v-1);
                points.push(new THREE.Vector4(scale*Math.sin(phi)*Math.cos(theta), scale*Math.sin(phi)*Math.sin(theta), scale*Math.cos(phi), 0));
            }
            return points;
        })(),
        edges: []
    }
};

function init() {
    scene = new THREE.Scene();
    const rendererContainer = document.getElementById('renderer-container');
    camera = new THREE.PerspectiveCamera(75, rendererContainer.clientWidth / rendererContainer.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(rendererContainer.clientWidth, rendererContainer.clientHeight);
    rendererContainer.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    setupEventListeners();
    switchShape('tesseract');
    animate();
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    document.getElementById('shape-list').querySelectorAll('li').forEach(item => {
        item.addEventListener('click', () => {
            const shapeName = item.getAttribute('data-shape');
            switchShape(shapeName);
            document.querySelector('#shape-list li.active').classList.remove('active');
            item.classList.add('active');
        });
    });
    // 'input' olayı, slider hareket ettikçe sürekli tetiklenir.
    // Animasyon döngüsü içinde slider değerini okuyacağımız için bu event listener'dan
    // updateProjection() çağrısını kaldırabiliriz, çünkü animate() zaten bunu yapıyor.
    // Bu, performansı bir miktar iyileştirebilir.
    // document.getElementById('w-slider').addEventListener('input', updateProjection);
}

function switchShape(shapeName) {
    if (currentObject) {
        scene.remove(currentObject);
        currentObject.geometry.dispose();
        if (currentObject.material.dispose) currentObject.material.dispose();
    }
    currentShape = shapeName;
    const data = SHAPES_DATA[shapeName];
    document.getElementById('shape-info').textContent = data.description;
    let geometry, material, object;
    const pointCount = data.type === 'lines' ? data.edges.length * 2 : data.points.length;
    const positions = new Float32Array(pointCount * 3);
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (data.type === 'lines') {
        let color = 0x00aaff;
        if (shapeName === 'framed_cube') color = 0xff69b4;
        material = new THREE.LineBasicMaterial({ color: color });
        object = new THREE.LineSegments(geometry, material);
    } else {
        material = new THREE.PointsMaterial({ color: 0x00ffaa, size: 0.035 });
        object = new THREE.Points(geometry, material);
    }
    currentObject = object;
    scene.add(currentObject);
    updateProjection();
}

function project(point4D, w_slider_val) {
    const p = point4D.clone();
    let w = p.w;
    if (currentShape !== 'framed_cube') { w *= w_slider_val; }
    if (currentShape === 'sphere') { w = p.z * w_slider_val * 0.5 + p.x * w_slider_val * 0.5; }
    const w_distance = 2;
    const perspective = w_distance / (w_distance - w);
    if (isNaN(perspective) || !isFinite(perspective)) { return new THREE.Vector3(9999, 9999, 9999); }
    return new THREE.Vector3(p.x * perspective, p.y * perspective, p.z * perspective);
}

function updateProjection() {
    const data = SHAPES_DATA[currentShape];
    if (!currentObject || !data) return;
    const w_slider_val = parseFloat(document.getElementById('w-slider').value);
    const positions = currentObject.geometry.attributes.position.array;
    let positionIndex = 0;
    const cos_yz = Math.cos(rotationAngle4D_yz);
    const sin_yz = Math.sin(rotationAngle4D_yz);
    const cos_xw = Math.cos(rotationAngle4D_xw);
    const sin_xw = Math.sin(rotationAngle4D_xw);
    const projectPoint = (p) => {
        let rotated_yz = new THREE.Vector4(p.x, p.y * cos_yz - p.z * sin_yz, p.y * sin_yz + p.z * cos_yz, p.w);
        let rotated_xw = new THREE.Vector4(rotated_yz.x * cos_xw - rotated_yz.w * sin_xw, rotated_yz.y, rotated_yz.z, rotated_yz.x * sin_xw + rotated_yz.w * cos_xw);
        const projected = project(rotated_xw, w_slider_val);
        positions[positionIndex++] = projected.x;
        positions[positionIndex++] = projected.y;
        positions[positionIndex++] = projected.z;
    };
    if (data.type === 'lines') {
        for (const edge of data.edges) { projectPoint(data.points[edge[0]]); projectPoint(data.points[edge[1]]); }
    } else {
        for (const point of data.points) { projectPoint(point); }
    }
    currentObject.geometry.attributes.position.needsUpdate = true;
}

function onWindowResize() {
    const rendererContainer = document.getElementById('renderer-container');
    camera.aspect = rendererContainer.clientWidth / rendererContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(rendererContainer.clientWidth, rendererContainer.clientHeight);
}

// ================== GÜNCELLENMİŞ ANA ANİMASYON DÖNGÜSÜ ==================
function animate() {
    requestAnimationFrame(animate);

    // Her karede slider'ın mevcut değerini oku.
    const w_slider_val = parseFloat(document.getElementById('w-slider').value);

    // Rotasyon hızını slider'ın değeriyle çarp.
    // Eğer slider 0 ise, hız 0 olur ve animasyon durur.
    // Eğer slider 1 ise, hız tam olur.
    rotationAngle4D_yz += rotationSpeed_yz * w_slider_val;
    rotationAngle4D_xw += rotationSpeed_xw * w_slider_val;

    // 3D kontroller (sürükleme, yakınlaştırma) her zaman çalışsın.
    controls.update();
    
    // Projeksiyonu her karede güncelle, çünkü rotasyon açıları değişmiş olabilir.
    updateProjection();

    // Sahneyi render et.
    renderer.render(scene, camera);
}
// ========================================================================

init();