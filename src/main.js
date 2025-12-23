import './style.css';
import jsyaml from 'js-yaml';
import { generateMatrix, extractMatrices } from './lib/matrix.js';

const yamlInput = document.getElementById('yaml-input');
const outputContainer = document.getElementById('output');
const countSpan = document.getElementById('count');
const errorMessage = document.getElementById('error-message');
const checkUnderspecified = document.getElementById('check-underspecified');
const underspecifiedCountContainer = document.getElementById('underspecified-count-container');
const underspecifiedCountSpan = document.getElementById('underspecified-count');
const cliNotification = document.getElementById('cli-notification');
const outputScrollContainer = document.getElementById('output-container');

// Banner visibility logic
function updateBannerVisibility() {
    const inputScrollTop = yamlInput.scrollTop;
    const outputScrollTop = outputScrollContainer ? outputScrollContainer.scrollTop : 0;
    
    // Hide if either is scrolled down
    if (inputScrollTop > 0 || outputScrollTop > 0) {
        cliNotification.classList.add('max-h-0', 'opacity-0', 'py-0', 'border-0', 'mt-0');
        cliNotification.classList.remove('max-h-24', 'opacity-100', 'py-3', 'border');
    } else {
        cliNotification.classList.remove('max-h-0', 'opacity-0', 'py-0', 'border-0', 'mt-0');
        cliNotification.classList.add('max-h-24', 'opacity-100', 'py-3', 'border');
    }
}

// Attach scroll listeners
yamlInput.addEventListener('scroll', updateBannerVisibility);
if (outputScrollContainer) {
    outputScrollContainer.addEventListener('scroll', updateBannerVisibility);
}

let currentJobResults = [];

yamlInput.addEventListener('input', () => {
  processInput();
});

checkUnderspecified.addEventListener('change', () => {
    renderOutput(currentJobResults);
});

// Initial processing
processInput();

function processInput() {
  const yaml = yamlInput.value;
  if (!yaml.trim()) {
    currentJobResults = [];
    renderOutput([]);
    errorMessage.classList.add('hidden');
    yamlInput.classList.remove('border-red-500');
    yamlInput.classList.add('border-gray-300');
    return;
  }

  try {
    const parsed = jsyaml.load(yaml);
    if (!parsed || typeof parsed !== 'object') {
        currentJobResults = [];
        renderOutput([]);
        return;
    }
    
    // Extract matrices (could be full workflow, jobs dict, strategy, or matrix)
    const matrixDefs = extractMatrices(parsed);
    
    currentJobResults = matrixDefs.map(def => ({
        name: def.name,
        combinations: generateMatrix(def.matrix)
    }));

    renderOutput(currentJobResults);
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

function renderOutput(jobResults) {
    // jobResults is an array of { name, combinations }
    
    // Calculate total count
    const totalCount = jobResults.reduce((acc, job) => acc + job.combinations.length, 0);
    countSpan.textContent = totalCount;
    outputContainer.innerHTML = '';
    
    const isCheckingUnderspecified = checkUnderspecified.checked;
    let globalUnderspecifiedCount = 0;

    // Light pastel colors for differentiation
    const bgColors = [
        'bg-blue-50', 'bg-green-50', 'bg-purple-50', 'bg-yellow-50', 
        'bg-pink-50', 'bg-indigo-50', 'bg-red-50', 'bg-orange-50',
        'bg-teal-50', 'bg-cyan-50', 'bg-lime-50', 'bg-emerald-50'
    ];
    
    jobResults.forEach(job => {
        const combinations = job.combinations;
        
        // If we have multiple jobs, show a heading
        if (jobResults.length > 1) {
            const jobHeading = document.createElement('h3');
            jobHeading.className = 'text-sm font-bold text-gray-700 mt-4 mb-2 first:mt-0';
            jobHeading.textContent = `Job: ${job.name} (${combinations.length})`;
            outputContainer.appendChild(jobHeading);
        }
        
        // Calculate key set for this job if checking underspecified
        const allKeys = new Set();
        if (isCheckingUnderspecified) {
            combinations.forEach(combo => {
                Object.keys(combo).forEach(k => allKeys.add(k));
            });
        }
        
        combinations.forEach((combo, index) => {
            const div = document.createElement('div');
            div.className = 'border border-[#d0d7de] rounded-md bg-white shadow-sm overflow-hidden hover:border-[#0969da] transition-colors';
            
            let isUnderspecified = false;
            if (isCheckingUnderspecified) {
                const comboKeys = Object.keys(combo);
                if (comboKeys.length < allKeys.size) {
                     isUnderspecified = true;
                }
            }
    
            if (isUnderspecified) {
                div.classList.remove('border-[#d0d7de]');
                div.classList.add('border-red-500', 'border-2');
                globalUnderspecifiedCount++;
            }
    
            const header = document.createElement('div');
            header.className = 'bg-[#f6f8fa] px-3 py-2 border-b border-[#d0d7de] flex justify-between items-center';
            
            let statusBadge = '';
            if (isUnderspecified) {
                statusBadge = '<span class="ml-2 text-[10px] font-bold text-red-600 uppercase border border-red-200 bg-red-50 px-1.5 py-0.5 rounded">Underspecified</span>';
            }
    
            header.innerHTML = `
                <div class="flex items-center">
                    <span class="text-xs font-semibold text-[#24292f]">Job ${index + 1}</span>
                    ${statusBadge}
                </div>
            `;
            div.appendChild(header);
    
            const body = document.createElement('div');
            
            const entries = Object.entries(combo);
            if (entries.length === 0) {
                 body.className = 'p-3';
                 body.innerHTML = '<span class="text-xs text-gray-500 italic">Empty environment</span>';
            } else {
                body.className = 'text-xs';
                
                entries.forEach(([k, v]) => {
                    const row = document.createElement('div');
                    // Color selection based on hash of the key
                    const colorIndex = Math.abs(stringHash(k)) % bgColors.length;
                    const bgColor = bgColors[colorIndex];
                    
                    row.className = `flex items-baseline px-3 py-2 border-b border-gray-100 last:border-0 ${bgColor}`;
                    
                    // Value formatting
                    let displayValue = v;
                    if (typeof v === 'object' && v !== null) {
                        displayValue = JSON.stringify(v);
                    }
                    
                    row.innerHTML = `
                        <span class="font-mono text-[#0969da] w-24 shrink-0 truncate mr-2 text-right" title="${k}">${k}</span>
                        <span class="font-mono text-[#24292f] break-all">${displayValue}</span>
                    `;
                    body.appendChild(row);
                });
            }
            
            div.appendChild(body);
            outputContainer.appendChild(div);
        });
    });

    if (isCheckingUnderspecified) {
        underspecifiedCountContainer.classList.remove('hidden');
        underspecifiedCountSpan.textContent = globalUnderspecifiedCount;
    } else {
        underspecifiedCountContainer.classList.add('hidden');
    }
}

function stringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}
