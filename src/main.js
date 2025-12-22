import './style.css';
import jsyaml from 'js-yaml';
import { generateMatrix } from './lib/matrix.js';

const yamlInput = document.getElementById('yaml-input');
const outputContainer = document.getElementById('output');
const countSpan = document.getElementById('count');
const errorMessage = document.getElementById('error-message');

yamlInput.addEventListener('input', () => {
  processInput();
});

// Initial processing
processInput();

function processInput() {
  const yaml = yamlInput.value;
  if (!yaml.trim()) {
    renderOutput([]);
    errorMessage.classList.add('hidden');
    yamlInput.classList.remove('border-red-500');
    yamlInput.classList.add('border-gray-300');
    return;
  }

  try {
    const parsed = jsyaml.load(yaml);
    if (!parsed) {
        renderOutput([]);
        return;
    }
    
    // Handle 'matrix' key if present, otherwise assume the whole object is the matrix
    let matrixDef = parsed;
    if (parsed.matrix) {
        matrixDef = parsed.matrix;
    } else if (parsed.strategy && parsed.strategy.matrix) {
        matrixDef = parsed.strategy.matrix;
    }

    const combinations = generateMatrix(matrixDef);
    renderOutput(combinations);
    errorMessage.classList.add('hidden');
    yamlInput.classList.remove('border-red-500');
    yamlInput.classList.add('border-gray-300');
  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
    yamlInput.classList.remove('border-gray-300');
    yamlInput.classList.add('border-red-500');
}

function renderOutput(combinations) {
    countSpan.textContent = combinations.length;
    outputContainer.innerHTML = '';
    
    combinations.forEach((combo, index) => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-white border border-gray-200 rounded shadow-sm hover:shadow-md transition-shadow';
        
        const entries = Object.entries(combo);
        if (entries.length === 0) {
            div.textContent = `Job ${index + 1}: (Empty environment)`;
        } else {
            // Header
            const title = document.createElement('div');
            title.className = 'font-semibold text-gray-800 mb-1';
            title.textContent = `Job ${index + 1}`;
            div.appendChild(title);
            
            // Key-values
            const list = document.createElement('ul');
            list.className = 'text-sm space-y-1';
            
            entries.forEach(([k, v]) => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="text-blue-600 font-mono">${k}:</span> <span class="text-gray-900">${v}</span>`;
                list.appendChild(li);
            });
            div.appendChild(list);
        }
        
        outputContainer.appendChild(div);
    });
}
