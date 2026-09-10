/**
 * Native Circuit Simulation Engine (Modified Nodal Analysis)
 * Supports: Wires, Resistors, Capacitors, Inductors, DC/AC Sources,
 * Diodes, Zener Diodes, Grounds, Switches, and Probes.
 */

// Helper to solve linear system Ax = b using Gaussian elimination with partial pivoting
export function solveLinearSystem(A, b) {
  const n = A.length;
  if (n === 0) return [];
  const M = A.map(row => [...row]);
  const x = [...b];

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(M[maxRow][i]) < 1e-12) {
      continue; // Skip singular/floating node
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    [x[i], x[maxRow]] = [x[maxRow], x[i]];

    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j < n; j++) {
        M[k][j] -= factor * M[i][j];
      }
      x[k] -= factor * x[i];
    }
  }

  const res = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-12) {
      res[i] = 0;
      continue;
    }
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += M[i][j] * res[j];
    }
    res[i] = (x[i] - sum) / M[i][i];
  }
  return res;
}

// Distance between two points
export function ptDist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Build node map from component terminals
export function buildCircuitGraph(elements) {
  const points = [];
  const ptToNode = new Map();

  // Find all distinct terminal coordinates (within 8px tolerance)
  function getPointKey(p) {
    const rx = Math.round(p.x / 10) * 10;
    const ry = Math.round(p.y / 10) * 10;
    return `${rx},${ry}`;
  }

  elements.forEach((el) => {
    [el.p1, el.p2].forEach((p) => {
      if (!p) return;
      const key = getPointKey(p);
      if (!ptToNode.has(key)) {
        ptToNode.set(key, points.length);
        points.push({ key, x: p.x, y: p.y });
      }
    });
  });

  // Check which node is Ground
  const groundNodes = new Set();
  elements.forEach((el) => {
    if (el.type === 'g' && el.p1) {
      const k = getPointKey(el.p1);
      if (ptToNode.has(k)) {
        groundNodes.add(ptToNode.get(k));
      }
    }
  });

  // If wire connects two points, merge them
  const parent = Array.from({ length: points.length }, (_, i) => i);
  function find(i) {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i, j) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  }

  // Wires and closed switches connect nodes directly
  elements.forEach((el) => {
    if ((el.type === 'w' || (el.type === 's' && el.closed)) && el.p1 && el.p2) {
      const k1 = getPointKey(el.p1);
      const k2 = getPointKey(el.p2);
      if (ptToNode.has(k1) && ptToNode.has(k2)) {
        union(ptToNode.get(k1), ptToNode.get(k2));
      }
    }
  });

  // Assign ground to 0
  const groupToNode = new Map();
  let nextNodeId = 1;

  // If any node in group is ground, that group becomes node 0
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    if (groundNodes.has(i)) {
      groupToNode.set(root, 0);
    }
  }

  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    if (!groupToNode.has(root)) {
      groupToNode.set(root, nextNodeId++);
    }
  }

  const finalNodeCount = nextNodeId; // Node 0 is Ground, 1..N-1 are unknowns

  function getNode(p) {
    if (!p) return 0;
    const key = getPointKey(p);
    const ptIdx = ptToNode.get(key);
    if (ptIdx === undefined) return 0;
    const root = find(ptIdx);
    return groupToNode.get(root) || 0;
  }

  return { getNode, nodeCount: finalNodeCount };
}

/**
 * Step the circuit forward by dt seconds using Modified Nodal Analysis
 */
export function stepCircuit(elements, simTime, dt) {
  const { getNode, nodeCount } = buildCircuitGraph(elements);
  const numVNodes = nodeCount > 1 ? nodeCount - 1 : 0;

  // Identify voltage sources (DC & AC)
  const vSources = [];
  elements.forEach((el) => {
    if (el.type === 'vdc' || el.type === 'vac') {
      vSources.push(el);
    }
  });

  const matrixSize = numVNodes + vSources.length;
  if (matrixSize === 0) return;

  // Helper to map circuit node (1..N-1) to matrix index (0..numVNodes-1)
  const nodeIdx = (node) => (node > 0 ? node - 1 : -1);

  // Iteration loop for non-linear components (diodes & zeners)
  const maxIterations = 8;
  for (let iter = 0; iter < maxIterations; iter++) {
    const A = Array.from({ length: matrixSize }, () => new Array(matrixSize).fill(0));
    const b = new Array(matrixSize).fill(0);

    // Stamp helper for conductance between node n1 and n2
    function stampConductance(n1, n2, g) {
      const i1 = nodeIdx(n1);
      const i2 = nodeIdx(n2);
      if (i1 >= 0) A[i1][i1] += g;
      if (i2 >= 0) A[i2][i2] += g;
      if (i1 >= 0 && i2 >= 0) {
        A[i1][i2] -= g;
        A[i2][i1] -= g;
      }
    }

    // Stamp current source flowing from n1 into n2
    function stampCurrentSource(n1, n2, iVal) {
      const i1 = nodeIdx(n1);
      const i2 = nodeIdx(n2);
      if (i1 >= 0) b[i1] -= iVal;
      if (i2 >= 0) b[i2] += iVal;
    }

    // Stamp components
    elements.forEach((el) => {
      const n1 = getNode(el.p1);
      const n2 = getNode(el.p2);

      if (el.type === 'r') {
        const r = Math.max(0.01, el.value || 1000);
        stampConductance(n1, n2, 1 / r);
      } else if (el.type === 'c') {
        // Capacitor companion model: Gc = C / dt, I_eq = Gc * v_prev
        const c = Math.max(1e-12, el.value || 1e-5);
        const gc = c / dt;
        stampConductance(n1, n2, gc);
        const vPrev = el.state?.v || 0;
        stampCurrentSource(n1, n2, gc * vPrev);
      } else if (el.type === 'l') {
        // Inductor companion model: Gl = dt / L, I_eq = i_prev
        const l = Math.max(1e-6, el.value || 0.1);
        const gl = dt / l;
        stampConductance(n1, n2, gl);
        const iPrev = el.state?.i || 0;
        stampCurrentSource(n1, n2, -iPrev);
      } else if (el.type === 'd') {
        // Diode model: Piecewise linear with forward drop 0.7V
        const vDiff = (el.state?.v1 || 0) - (el.state?.v2 || 0);
        if (vDiff >= 0.7) {
          const rOn = 10; // 10 ohm on-resistance
          stampConductance(n1, n2, 1 / rOn);
          stampCurrentSource(n1, n2, 0.7 / rOn);
        } else {
          const rOff = 1e6; // 1 Mohm reverse leakage
          stampConductance(n1, n2, 1 / rOff);
        }
      } else if (el.type === 'z') {
        // Zener diode model: Anode is p1, Cathode is p2
        const vDiff = (el.state?.v1 || 0) - (el.state?.v2 || 0); // V(anode) - V(cathode)
        const vz = el.vz || 5.1;
        if (vDiff >= 0.7) {
          // Forward biased
          const rOn = 10;
          stampConductance(n1, n2, 1 / rOn);
          stampCurrentSource(n1, n2, 0.7 / rOn);
        } else if (vDiff <= -vz) {
          // Zener breakdown
          const rZ = 5;
          stampConductance(n1, n2, 1 / rZ);
          stampCurrentSource(n1, n2, -vz / rZ);
        } else {
          // Normal reverse blocking
          const rOff = 1e6;
          stampConductance(n1, n2, 1 / rOff);
        }
      }
    });

    // Stamp voltage sources
    vSources.forEach((vs, idx) => {
      const n1 = getNode(vs.p1); // positive terminal
      const n2 = getNode(vs.p2); // negative terminal
      const vRow = numVNodes + idx;

      let vVal = 0;
      if (vs.type === 'vdc') {
        vVal = vs.value || 5;
      } else if (vs.type === 'vac') {
        const freq = vs.freq || 50;
        const amp = vs.value || 10;
        vVal = amp * Math.sin(2 * Math.PI * freq * simTime);
      }

      const i1 = nodeIdx(n1);
      const i2 = nodeIdx(n2);

      if (i1 >= 0) {
        A[i1][vRow] += 1;
        A[vRow][i1] += 1;
      }
      if (i2 >= 0) {
        A[i2][vRow] -= 1;
        A[vRow][i2] -= 1;
      }
      b[vRow] = vVal;
    });

    // Solve for voltages and currents
    const sol = solveLinearSystem(A, b);

    // Read voltages back
    function getSolV(node) {
      if (node === 0) return 0;
      const idx = nodeIdx(node);
      return idx >= 0 && idx < sol.length ? sol[idx] : 0;
    }

    // Update element states
    elements.forEach((el) => {
      const n1 = getNode(el.p1);
      const n2 = getNode(el.p2);
      const v1 = getSolV(n1);
      const v2 = getSolV(n2);
      const vDrop = v1 - v2;

      if (!el.state) el.state = {};
      el.state.v1 = v1;
      el.state.v2 = v2;
      el.state.v = vDrop;

      if (el.type === 'r') {
        el.state.i = vDrop / Math.max(0.01, el.value || 1000);
      } else if (el.type === 'c') {
        const c = el.value || 1e-5;
        const vPrev = el.state.vPrev || 0;
        el.state.i = (c / dt) * (vDrop - vPrev);
      } else if (el.type === 'l') {
        const l = el.value || 0.1;
        const iPrev = el.state.iPrev || 0;
        el.state.i = iPrev + (dt / l) * vDrop;
      } else if (el.type === 'd') {
        el.state.i = vDrop >= 0.7 ? (vDrop - 0.7) / 10 : vDrop / 1e6;
      } else if (el.type === 'z') {
        const vz = el.vz || 5.1;
        if (vDrop >= 0.7) el.state.i = (vDrop - 0.7) / 10;
        else if (vDrop <= -vz) el.state.i = (vDrop + vz) / 5;
        else el.state.i = vDrop / 1e6;
      }
    });

    // Update source currents
    vSources.forEach((vs, idx) => {
      const current = sol[numVNodes + idx] || 0;
      if (!vs.state) vs.state = {};
      vs.state.i = -current; // current exiting positive terminal
    });

    // Only 1 iteration needed for linear; up to 3 for diodes
    if (iter >= 2) break;
  }

  // Commit history states for dynamic elements
  elements.forEach((el) => {
    if (el.state) {
      el.state.vPrev = el.state.v;
      el.state.iPrev = el.state.i;
    }
  });
}

/**
 * Netlist Parser & Serializer
 * Supports CircuitJS-style and clean ASCII circuit syntax
 */
export function parseNetlist(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const elements = [];
  let idCounter = 1;

  for (const line of lines) {
    if (line.startsWith('$')) continue; // CircuitJS header

    const parts = line.split(/\s+/);
    const type = parts[0].toLowerCase();

    // Syntax: <type> <x1> <y1> <x2> <y2> [value/options...]
    if (['w', 'r', 'c', 'l', 'd', 'z', 'g', 'vdc', 'vac', 's'].includes(type) || ['v'].includes(type)) {
      const x1 = parseFloat(parts[1]);
      const y1 = parseFloat(parts[2]);
      const x2 = parseFloat(parts[3]) || x1;
      const y2 = parseFloat(parts[4]) || y1;

      if (isNaN(x1) || isNaN(y1)) continue;

      let elType = type;
      let val = 0;
      let freq = 50;
      let vz = 5.1;

      if (type === 'v') {
        // In CircuitJS, v is often voltage source: v x1 y1 x2 y2 flags maxV frequency ...
        // flags & 1 == AC, flags & 0 == DC
        const flags = parseInt(parts[5]) || 0;
        const maxV = parseFloat(parts[7]) || parseFloat(parts[5]) || 10;
        const f = parseFloat(parts[6]) || 50;
        if (flags % 2 === 1 || f > 0) {
          elType = 'vac';
          val = maxV;
          freq = f;
        } else {
          elType = 'vdc';
          val = maxV;
        }
      } else if (type === 'r') {
        val = parseFloat(parts[5]) || parseFloat(parts[6]) || 1000;
      } else if (type === 'c') {
        val = parseFloat(parts[5]) || parseFloat(parts[6]) || 1e-5;
      } else if (type === 'l') {
        val = parseFloat(parts[5]) || parseFloat(parts[6]) || 0.1;
      } else if (type === 'z') {
        vz = parseFloat(parts[6]) || parseFloat(parts[5]) || 5.1;
      }

      elements.push({
        id: `el_${idCounter++}`,
        type: elType,
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        value: val,
        freq,
        vz,
        closed: true,
      });
    }
  }

  return elements;
}

export function exportNetlist(elements) {
  const lines = ['# Arsenal Tools Circuit Simulation Netlist', '$ 1 0.000005 10.2 50 5 43'];
  elements.forEach((el) => {
    const x1 = Math.round(el.p1.x);
    const y1 = Math.round(el.p1.y);
    const x2 = Math.round(el.p2?.x || x1);
    const y2 = Math.round(el.p2?.y || y1);

    if (el.type === 'w') {
      lines.push(`w ${x1} ${y1} ${x2} ${y2} 0`);
    } else if (el.type === 'r') {
      lines.push(`r ${x1} ${y1} ${x2} ${y2} 0 ${el.value || 1000}`);
    } else if (el.type === 'c') {
      lines.push(`c ${x1} ${y1} ${x2} ${y2} 0 ${el.value || 1e-5} 0`);
    } else if (el.type === 'l') {
      lines.push(`l ${x1} ${y1} ${x2} ${y2} 0 ${el.value || 0.1} 0`);
    } else if (el.type === 'vdc') {
      lines.push(`v ${x1} ${y1} ${x2} ${y2} 0 0 40 ${el.value || 5} 0 0 0.5`);
    } else if (el.type === 'vac') {
      lines.push(`v ${x1} ${y1} ${x2} ${y2} 0 1 ${el.freq || 50} ${el.value || 10} 0 0 0.5`);
    } else if (el.type === 'd') {
      lines.push(`d ${x1} ${y1} ${x2} ${y2} 0 0.7`);
    } else if (el.type === 'z') {
      lines.push(`z ${x1} ${y1} ${x2} ${y2} 0 ${el.vz || 5.1}`);
    } else if (el.type === 'g') {
      lines.push(`g ${x1} ${y1} ${x2} ${y2} 0`);
    } else if (el.type === 's') {
      lines.push(`s ${x1} ${y1} ${x2} ${y2} 0 ${el.closed ? 0 : 1}`);
    }
  });
  return lines.join('\n');
}
