const doc = document;

// --- Grid & Cell Definitions ---
const GRID_ROWS = 25;
const GRID_COLS = 50;
const CELL_TYPES = {
    WALL: 1,
    PATH: 0,
    START: 2,
    END: 3,
    VISITED: 4,
    SHORTEST_PATH: 5
};
const CELL_COLORS = {
    [CELL_TYPES.WALL]: 'wall',
    [CELL_TYPES.PATH]: 'path',
    [CELL_TYPES.START]: 'start',
    [CELL_TYPES.END]: 'end',
    [CELL_TYPES.VISITED]: 'visited',
    [CELL_TYPES.SHORTEST_PATH]: 'shortest-path'
};

let grid = [];
let startPoint = null;
let endPoint = null;
let isDrawing = false;
let animationDelay = 10; 

// --- DOM Element References ---
const mazeGridElement = doc.getElementById('maze-grid');
const bfsBtn = doc.getElementById('bfs-btn');
const dfsBtn = doc.getElementById('dfs-btn');
const dijkstraBtn = doc.getElementById('dijkstra-btn');
const randomMazeBtn = doc.getElementById('random-maze-btn');
const clearPathBtn = doc.getElementById('clear-path-btn');
const clearWallsBtn = doc.getElementById('clear-walls-btn');
const timeDisplayElement = doc.getElementById('time-display');

// --- Grid UI Functions ---
function initializeGrid() {
    startPoint = null;
    endPoint = null;
    grid = [];
    if (mazeGridElement) {
      mazeGridElement.innerHTML = '';
      mazeGridElement.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;
      
      for (let row = 0; row < GRID_ROWS; row++) {
          grid[row] = [];
          for (let col = 0; col < GRID_COLS; col++) {
              grid[row][col] = CELL_TYPES.PATH;
              const cell = doc.createElement('div');
              cell.classList.add('grid-cell', CELL_COLORS[CELL_TYPES.PATH]);
              cell.dataset.row = row;
              cell.dataset.col = col;
              mazeGridElement.appendChild(cell);
          }
      }
    }
}

function drawMaze() {
    if (!mazeGridElement) return;
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const cell = mazeGridElement.children[row * GRID_COLS + col];
            cell.className = `grid-cell ${CELL_COLORS[grid[row][col]]}`;
            cell.textContent = '';
            if (grid[row][col] === CELL_TYPES.START) {
                cell.textContent = 'S';
            } else if (grid[row][col] === CELL_TYPES.END) {
                cell.textContent = 'E';
            }
        }
    }
}

function handleGridMouseDown(e) {
    if (!e.target.dataset.row) return;
    isDrawing = true;
    const target = e.target;
    const row = parseInt(target.dataset.row);
    const col = parseInt(target.dataset.col);
    if (grid[row][col] === CELL_TYPES.PATH) {
        if (!startPoint) {
            startPoint = {row, col};
            grid[row][col] = CELL_TYPES.START;
        } else if (!endPoint) {
            endPoint = {row, col};
            grid[row][col] = CELL_TYPES.END;
        } else {
            grid[row][col] = CELL_TYPES.WALL;
        }
    } else if (grid[row][col] === CELL_TYPES.WALL) {
        grid[row][col] = CELL_TYPES.PATH;
    }
    drawMaze();
}

function handleGridMouseUp() {
    isDrawing = false;
}

function handleGridMouseMove(e) {
    if (!isDrawing || !e.target.dataset.row) return;
    const target = e.target;
    const row = parseInt(target.dataset.row);
    const col = parseInt(target.dataset.col);
    if (startPoint && endPoint && grid[row][col] === CELL_TYPES.PATH) {
        grid[row][col] = CELL_TYPES.WALL;
        drawMaze();
    }
}

function handleClearPath() {
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            if (grid[row][col] === CELL_TYPES.VISITED || grid[row][col] === CELL_TYPES.SHORTEST_PATH) {
                grid[row][col] = CELL_TYPES.PATH;
            }
        }
    }
    drawMaze();
}

function handleClearWalls() {
    initializeGrid();
    drawMaze();
}

// =================================================================
// --- NEW: PATHFINDING LOGIC (PORTED FROM PYTHON) ---
// =================================================================

const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

// --- Priority Queue (Min-Heap) for Dijkstra ---
// (JavaScript doesn't have a built-in heapq, so we create one)
class PriorityQueue {
    constructor() { this.heap = []; }
    isEmpty() { return this.heap.length === 0; }
    _swap(i, j) { [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]]; }
    _bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index][0] < this.heap[parentIndex][0]) {
                this._swap(index, parentIndex);
                index = parentIndex;
            } else { break; }
        }
    }
    _bubbleDown(index) {
        const lastIndex = this.heap.length - 1;
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let smallestIndex = index;
            if (leftChildIndex <= lastIndex && this.heap[leftChildIndex][0] < this.heap[smallestIndex][0]) {
                smallestIndex = leftChildIndex;
            }
            if (rightChildIndex <= lastIndex && this.heap[rightChildIndex][0] < this.heap[smallestIndex][0]) {
                smallestIndex = rightChildIndex;
            }
            if (smallestIndex !== index) {
                this._swap(index, smallestIndex);
                index = smallestIndex;
            } else { break; }
        }
    }
    push(item) { // item is [cost, [r, c]]
        this.heap.push(item);
        this._bubbleUp(this.heap.length - 1);
    }
    pop() {
        if (this.isEmpty()) return null;
        this._swap(0, this.heap.length - 1);
        const item = this.heap.pop();
        this._bubbleDown(0);
        return item;
    }
}

/**
 * Checks if a cell is valid (within bounds and not a wall).
 */
function is_valid(x, y, rows, cols, maze) {
    return x >= 0 && x < rows && y >= 0 && y < cols && maze[x][y] !== CELL_TYPES.WALL;
}

/**
 * Reconstructs the path from the parent map.
 * JS objects can't use arrays as keys, so we use "row,col" strings.
 */
function reconstruct_path(parent, start, end) {
    const path = [];
    const startKey = `${start[0]},${start[1]}`;
    let currentKey = `${end[0]},${end[1]}`;

    while (currentKey !== startKey) {
        path.push(currentKey.split(',').map(Number));
        currentKey = parent[currentKey]; // Get the parent's string key
    }
    path.push(start);
    return path.reverse();
}

/**
 * Solves the maze using Breadth-First Search (BFS).
 */
function solve_bfs(maze, start, end) {
    const rows = maze.length;
    const cols = maze[0].length;
    const queue = [start]; // Use array as a queue
    const visited = new Set([`${start[0]},${start[1]}`]); // Use Set for O(1) lookups
    const parent = {}; // Use object as a map: { "r,c": "pr,pc" }
    const visited_cells = [];

    const start_time = performance.now();

    while (queue.length > 0) {
        const current = queue.shift(); // Dequeue
        const [r, c] = current;
        const currentKey = `${r},${c}`;
        visited_cells.push(current);

        if (r === end[0] && c === end[1]) {
            const end_time = performance.now();
            return {
                visited_cells,
                path: reconstruct_path(parent, start, end),
                time_taken: (end_time - start_time) / 1000
            };
        }

        for (const [dx, dy] of DIRECTIONS) {
            const neighbor = [r + dx, c + dy];
            const [nr, nc] = neighbor;
            const neighborKey = `${nr},${nc}`;

            if (is_valid(nr, nc, rows, cols, maze) && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighbor); // Enqueue
                parent[neighborKey] = currentKey;
            }
        }
    }

    const end_time = performance.now();
    return { visited_cells, path: [], time_taken: (end_time - start_time) / 1000 };
}

/**
 * Solves the maze using Depth-First Search (DFS).
 */
function solve_dfs(maze, start, end) {
    const rows = maze.length;
    const cols = maze[0].length;
    const stack = [start]; // Use array as a stack
    const visited = new Set([`${start[0]},${start[1]}`]);
    const parent = {};
    const visited_cells = [];

    const start_time = performance.now();

    while (stack.length > 0) {
        const current = stack.pop(); // Pop from stack
        const [r, c] = current;
        const currentKey = `${r},${c}`;
        visited_cells.push(current);

        if (r === end[0] && c === end[1]) {
            const end_time = performance.now();
            return {
                visited_cells,
                path: reconstruct_path(parent, start, end),
                time_taken: (end_time - start_time) / 1000
            };
        }

        for (const [dx, dy] of DIRECTIONS) {
            const neighbor = [r + dx, c + dy];
            const [nr, nc] = neighbor;
            const neighborKey = `${nr},${nc}`;

            if (is_valid(nr, nc, rows, cols, maze) && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                stack.push(neighbor); // Push to stack
                parent[neighborKey] = currentKey;
            }
        }
    }

    const end_time = performance.now();
    return { visited_cells, path: [], time_taken: (end_time - start_time) / 1000 };
}

/**
 * Solves the maze using Dijkstra's Algorithm.
 */
function solve_dijkstra(maze, start, end) {
    const rows = maze.length;
    const cols = maze[0].length;
    const pq = new PriorityQueue();
    const distances = {};
    const parent = {};
    const visited_cells = [];
    
    // Initialize distances
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            distances[`${r},${c}`] = Infinity;
        }
    }
    
    const startKey = `${start[0]},${start[1]}`;
    distances[startKey] = 0;
    pq.push([0, start]); // [cost, [r, c]]

    const start_time = performance.now();

    while (!pq.isEmpty()) {
        const [cost, current] = pq.pop();
        const [r, c] = current;
        const currentKey = `${r},${c}`;

        if (cost > distances[currentKey]) {
            continue;
        }
        
        visited_cells.push(current);

        if (r === end[0] && c === end[1]) {
            const end_time = performance.now();
            return {
                visited_cells,
                path: reconstruct_path(parent, start, end),
                time_taken: (end_time - start_time) / 1000
            };
        }

        for (const [dx, dy] of DIRECTIONS) {
            const neighbor = [r + dx, c + dy];
            const [nr, nc] = neighbor;
            const neighborKey = `${nr},${nc}`;

            if (is_valid(nr, nc, rows, cols, maze)) {
                const new_cost = cost + 1; // All path weights are 1
                if (new_cost < distances[neighborKey]) {
                    distances[neighborKey] = new_cost;
                    pq.push([new_cost, neighbor]);
                    parent[neighborKey] = currentKey;
                }
            }
        }
    }
    
    const end_time = performance.now();
    return { visited_cells, path: [], time_taken: (end_time - start_time) / 1000 };
}


// =================================================================
// --- UPDATED: Main Solve Function (No Fetch) ---
// =================================================================

/**
 * Main function to trigger the maze solve and animation.
 * This function no longer uses 'fetch'.
 */
async function solveMaze(algorithm) {
    if (!startPoint || !endPoint) {
        alert('Please set both start (S) and end (E) points first.');
        return;
    }
    handleClearPath();
    timeDisplayElement.innerHTML = `Solving with ${algorithm.toUpperCase()}...`;

    // Timer starts before the algorithm and animation
    const startTime = performance.now(); 

    let data;
    const start = [startPoint.row, startPoint.col];
    const end = [endPoint.row, endPoint.col];

    // Call the local JavaScript functions directly
    if (algorithm === 'bfs') {
        data = solve_bfs(grid, start, end);
    } else if (algorithm === 'dfs') {
        data = solve_dfs(grid, start, end);
    } else if (algorithm === 'dijkstra') {
        data = solve_dijkstra(grid, start, end);
    }

    // The 'try...catch' block is now just for the animation part
    try {
        if (data.path && data.path.length > 0) {
            await animate(data.visited_cells, data.path);
            const endTime = performance.now(); // Timer stops *after* animation
            const totalTime = ((endTime - startTime) / 1000).toFixed(3);
            const pathLength = data.path.length;
            timeDisplayElement.innerHTML = `Path Found! Length: <strong class="text-blue-600">${pathLength}</strong> cells, Time: <strong class="text-blue-600">${totalTime}s</strong>`;
        } else {
            await animate(data.visited_cells, []);
            const endTime = performance.now(); // Timer stops *after* animation
            const totalTime = ((endTime - startTime) / 1000).toFixed(3);
            timeDisplayElement.innerHTML = `No Path Found! Length: <strong class="text-red-500">0</strong> cells, Time: <strong class="text-red-500">${totalTime}s</strong>`;
            alert('No path found!');
        }

    } catch (error) {
        console.error('Error solving maze:', error);
        alert('An error occurred while solving the maze.');
    }
}

/**
 * Animates the visited cells and the final path.
 * (This function is unchanged)
 */
async function animate(visitedCells, path) {
    for (const [row, col] of visitedCells) {
        if (grid[row][col] !== CELL_TYPES.START && grid[row][col] !== CELL_TYPES.END) {
            const cell = mazeGridElement.children[row * GRID_COLS + col];
            cell.className = `grid-cell ${CELL_COLORS[CELL_TYPES.VISITED]} visited-animation`;
            await new Promise(resolve => setTimeout(resolve, animationDelay));
        }
    }

    if (path.length > 0) {
        for (const [row, col] of path) {
            if (grid[row][col] !== CELL_TYPES.START && grid[row][col] !== CELL_TYPES.END) {
                const cell = mazeGridElement.children[row * GRID_COLS + col];
                cell.className = `grid-cell ${CELL_COLORS[CELL_TYPES.SHORTEST_PATH]} path-animation`;
                await new Promise(resolve => setTimeout(resolve, animationDelay));
            }
        }
    }
}

// --- Event Listeners (Unchanged) ---
doc.addEventListener('DOMContentLoaded', () => {
    // Only set up event listeners after the DOM is fully loaded.
    if (mazeGridElement) {
        mazeGridElement.addEventListener('mousedown', handleGridMouseDown);
        mazeGridElement.addEventListener('mouseup', handleGridMouseUp);
        mazeGridElement.addEventListener('mousemove', handleGridMouseMove);
        mazeGridElement.addEventListener('mouseleave', handleGridMouseUp);
    }
    if (bfsBtn) bfsBtn.addEventListener('click', () => solveMaze('bfs'));
    if (dfsBtn) dfsBtn.addEventListener('click', () => solveMaze('dfs'));
    if (dijkstraBtn) dijkstraBtn.addEventListener('click', () => solveMaze('dijkstra'));
    if (randomMazeBtn) randomMazeBtn.addEventListener('click', () => {
        initializeGrid();
        startPoint = {row: Math.floor(Math.random() * GRID_ROWS), col: Math.floor(Math.random() * GRID_COLS)};
        
        // Ensure start and end points are not the same
        do {
            endPoint = {row: Math.floor(Math.random() * GRID_ROWS), col: Math.floor(Math.random() * GRID_COLS)};
        } while (startPoint.row === endPoint.row && startPoint.col === endPoint.col);

        grid[startPoint.row][startPoint.col] = CELL_TYPES.START;
        grid[endPoint.row][endPoint.col] = CELL_TYPES.END;
        
        for(let i = 0; i < GRID_ROWS * GRID_COLS * 0.4; i++) {
            let row = Math.floor(Math.random() * GRID_ROWS);
            let col = Math.floor(Math.random() * GRID_COLS);
            if (grid[row][col] === CELL_TYPES.PATH) {
                grid[row][col] = CELL_TYPES.WALL;
            }
        }
        drawMaze();
        timeDisplayElement.innerHTML = '';
    });
    if (clearPathBtn) clearPathBtn.addEventListener('click', () => {
        handleClearPath();
        timeDisplayElement.innerHTML = '';
    });
    if (clearWallsBtn) clearWallsBtn.addEventListener('click', () => {
        handleClearWalls();
        timeDisplayElement.innerHTML = '';
    });

    initializeGrid();
    drawMaze();
});