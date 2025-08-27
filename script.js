const mvpColumnsDropdown = document.getElementById("mvpColumns");
const mvpTableContainer = document.getElementById("mvp-table-container");
const messageDiv = document.getElementById("message");
const createOpportunityBtn = document.getElementById("createOpportunityBtn");
const filtersContainer = document.getElementById("filters-container");

const BASE_URL = "https://4p6i86w6ac.execute-api.us-east-2.amazonaws.com/test";
const API_KEY = "testing-12345";
const GHL_TOKEN = "Bearer pit-3398d27c-748d-4be6-9f55-683030bdc377";
const GHL_VERSION = "2021-07-28";
const LOCATION_ID = "xWzbp40cgJND3UmZgNiS";

// Global variables to hold pipeline and stage IDs
let PIPELINE_ID = "TPk33GXjQMJVcDxQ5yNt";
let PIPELINE_STAGE = "4ae95164-10ac-401f-8ea1-2f9290eb1ada";

window.onload = async () => {
  await loadPipelines();
  await loadColumns();
};

document.getElementById('pipelineDropdown').addEventListener('change', (event) => {
    const selected = JSON.parse(event.target.value);
    if (selected) {
        PIPELINE_ID = selected.pipelineId;
        PIPELINE_STAGE = selected.stageId;
    }
});

async function loadColumns() {
  try {
    const table = "vw_mvp_simple";

    const res = await fetch(`${BASE_URL}/get_database_columns?table=${table}`, {
      method: "GET",
      headers: { "x-api-key": API_KEY }
    });
    if (!res.ok) throw new Error(`Error fetching columns for ${table}`);
    
    const result = await res.json();
    populateDropdown(mvpColumnsDropdown, result.columns);

    // Pre-select all columns
    Array.from(mvpColumnsDropdown.options).forEach(opt => {
        opt.selected = true;
    });

  } catch (e) {
    console.error(e);
    messageDiv.textContent = "Error loading columns.";
  }
}

function populateDropdown(dropdown, columns) {
  dropdown.innerHTML = "";
  (columns || []).filter(c => c).forEach(col => {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    dropdown.appendChild(opt);
  });
}

async function fetchData() {
  messageDiv.textContent = "";
  mvpTableContainer.innerHTML = "";
  createOpportunityBtn.disabled = true;

  const selectedCols = Array.from(mvpColumnsDropdown.options).map(opt => opt.value);

  if (selectedCols.length === 0) {
    messageDiv.textContent = "No columns available to display.";
    return;
  }

  try {
    const data = await getDataForTable("vw_mvp_simple", selectedCols);
    if (data) {
      createTable(selectedCols, data, mvpTableContainer);
      createOpportunityBtn.disabled = false;
    }
  } catch (e) {
    console.error(e);
    messageDiv.textContent = "Error fetching data.";
  }
}

async function getDataForTable(tableName, columns) {
  const res = await fetch(`${BASE_URL}/get_data_from_columns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify({ table: tableName, columns: columns })
  });

  if (!res.ok) throw new Error(`HTTP error fetching data for ${tableName}! status: ${res.status}`);
  
  const result = await res.json();
  if (!Array.isArray(result) || result.length === 0) {
    messageDiv.textContent += `No data found for ${tableName}.`;
    return null;
  }

  return result;
}

function addFilterRow() {
  const row = document.createElement("div");
  row.classList.add("filter-row");

  const colSelect = document.createElement("select");
  
  const newFilterOption = document.createElement("option");
  newFilterOption.value = "Refills Coming Due";
  colSelect.appendChild(newFilterOption);

  Array.from(mvpColumnsDropdown.options).forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.textContent;
    colSelect.appendChild(option);
  });
  
  colSelect.onchange = (event) => {
    if (event.target.value === "Refills Coming Due") {
      operatorSelect.style.display = 'none';
    } else {
      operatorSelect.style.display = 'inline';
    }
  };

  const operatorSelect = document.createElement("select");
  ["=", ">", "<"].forEach(op => {
    const option = document.createElement("option");
    option.value = op;
    option.textContent = op;
    operatorSelect.appendChild(option);
  });

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.placeholder = "Enter value";

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "x";
  removeBtn.onclick = () => row.remove();

  row.appendChild(colSelect);
  row.appendChild(operatorSelect);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);

  filtersContainer.appendChild(row);
}

function applyFilters() {
  const table = mvpTableContainer.querySelector("table");
  if (!table) return;

  const rows = table.querySelectorAll("tbody tr");
  const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent);

  // Obtener el valor del nuevo campo de entrada fijo
  const refillsDaysInput = document.getElementById("refillsDaysInput");
  const daysValue = parseInt(refillsDaysInput.value, 10);
  const refillDateIndex = headers.indexOf("Next refill date");
  const isRefillsFilterActive = !isNaN(daysValue) && daysValue > 0 && refillDateIndex !== -1;

  // Obtener los filtros dinámicos
  const filters = Array.from(filtersContainer.querySelectorAll(".filter-row")).map(row => {
    return {
      column: row.children[0].value,
      operator: row.children[1].value,
      value: row.children[2].value
    };
  });

  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll("td"));
    let show = true;

    // Aplicar el filtro de recargas próximas (si está activo)
    if (isRefillsFilterActive) {
      const refillDateStr = cells[refillDateIndex]?.textContent.trim();
      if (refillDateStr) {
        const refillDate = new Date(refillDateStr);
        const today = new Date();
        const cutOffDate = new Date();
        cutOffDate.setDate(today.getDate() + daysValue);
        
        // La fila se oculta si la fecha de recarga no está en el rango
        if (refillDate > cutOffDate || refillDate < today) {
          show = false;
        }
      } else {
        show = false;
      }
    }

    // Aplicar los filtros dinámicos
    if (show) {
      for (let f of filters) {
        const colIndex = headers.indexOf(f.column);
        if (colIndex === -1) continue;
        const cellValue = cells[colIndex]?.textContent.trim();
  
        let left = isNaN(cellValue) ? cellValue : parseFloat(cellValue);
        let right = isNaN(f.value) ? f.value : parseFloat(f.value);
  
        if (f.operator === "=") {
          if (!isNaN(left) && !isNaN(right)) {
            if (left != right) show = false;
          } else {
            if (!String(left).toLowerCase().includes(String(right).toLowerCase())) {
              show = false;
            }
          }
        }
        if (f.operator === ">" && !(left > right)) show = false;
        if (f.operator === "<" && !(left < right)) show = false;
      }
    }

    row.style.display = show ? "" : "none";
  });
}

function createTable(columns, data, container) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  data.forEach(row => {
  const tr = document.createElement("tr");
  columns.forEach(col => {
    const td = document.createElement("td");
    td.textContent = row[col] !== undefined ? row[col] : "";
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);
}

async function createOpportunitiesFromTable() {
  const table = mvpTableContainer.querySelector("table");

  if (!table) {
      alert("No data table found. Please click 'Get Data' first.");
      return;
  }

  const columns = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent);
  const rows = Array.from(table.querySelectorAll("tbody tr")).filter(row => row.style.display !== "none");
  
  let opportunitiesCreated = 0;
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    const selectedData = {};
    columns.forEach((col, idx) => {
      selectedData[col] = cells[idx]?.textContent.trim() || "";
    });

    console.log(selectedData)

    // 1) Create contact or retrieve existing
    const contactPayload = {
      firstName: selectedData["First Name"],
      lastName: selectedData["Last Name"],
      name: `${selectedData["First Name"]} ${selectedData["Last Name"]}`.trim(),
      email: selectedData["Email"],
      phone: selectedData["Phone"],
      address1: selectedData["Street Address"],
      city: selectedData["City"],
      state: selectedData["State"],
      postalCode: selectedData["ZIP"],
      locationId: LOCATION_ID
    };
    let contactId;
    try {
      const contactRes = await fetch("https://services.leadconnectorhq.com/contacts/", {
        method: "POST",
        headers: {
          Authorization: GHL_TOKEN,
          Version: GHL_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(contactPayload)
      });
      if (!contactRes.ok) {
        const errorBody = await contactRes.json();
        if (contactRes.status === 400 && errorBody.message === "This location does not allow duplicated contacts.") {
          contactId = errorBody.meta?.contactId;
          console.log(`Duplicate contact found. Using existing contactId: ${contactId}`);
        } else {
          throw new Error(`Contact creation failed: ${contactRes.status} ${JSON.stringify(errorBody)}`);
        }
      } else {
        const contactData = await contactRes.json();
        contactId = contactData.contact?.id;
      }
    } catch (error) {
      console.error("Error creating or finding contact:", error);
      continue;
    }

    if (!contactId) {
      console.error("No contact ID returned for:", contactPayload.name);
      continue;
    }

    // 2) Create opportunity
    const oppPayload = {
      pipelineId: PIPELINE_ID,
      locationId: LOCATION_ID,
      name: `${selectedData["First Name"]} ${selectedData["Last Name"]}`,
      pipelineStageId: PIPELINE_STAGE,
      status: "open",
      contactId,
      monetaryValue: 0,
      customFields: [
        { id: "RLBWVVvGDO15Szr92mpG", key: "opportunity.dependent_first_name", field_value: selectedData["First Name"] },
        { id: "t5LCdSTLec3uSIC1HQg9", key: "opportunity.dependent_last_name", field_value: selectedData["Last Name"] },
        { id: "VKuJVd605d77bNsalDxi", key: "opportunity.date_of_birth_rx", field_value: selectedData["Date of Birth"] },
        { id: "4RNP82sEuvd8FYwemvfp", key: "opportunity.patient_age", field_value: selectedData["Age"] },
        { id: "tS9YG2C0eTyzPa3uBKEN", key: "opportunity.next_refill_date", field_value: selectedData["Next refill date"] },
        { id: "takOv1oPpchD2mw0FlqP", key: "opportunity.medication_name", field_value: selectedData["Medication Name"] },
        { id: "ElNn9vke04rTLPPE41Qu", key: "opportunity.refills_remaining", field_value: selectedData["Refills remaining"] },
        { id: "THKGZ1DPfsIOskX2Xxr0", key: "opportunity.primary_category", field_value: selectedData["Primary Category"] },
        { id: "MhX3oQfMbmmQDAaN6Rk0", key: "opportunity.primary_tp_bin", field_value: selectedData["Primary TP BIN"] },
        { id: "qnivc7LVe0JapYgNq1sw", key: "opportunity.primary_tp_pcn", field_vsalue: selectedData["Primary TP PCN"] },
        { id: "fOgmPzJJNZGSNhWJ8cEA", key: "opportunity.primary_tp_group_number", field_value: selectedData["Primary TP Group Number"] },
        { id: "bZEO4i2DPeZScsOdJhJJ", key: "opportunity.insurance_mbi", field_value: selectedData["Insurance MBI"] },
        { id: "QtoptYYdaxqJHv4Prj9q", key: "opportunity.serial_number", field_value: selectedData["Serial Number"] }
      ]
    };
    
    try {
      const oppRes = await fetch("https://services.leadconnectorhq.com/opportunities/", {
        method: "POST",
        headers: {
          Authorization: GHL_TOKEN,
          Version: GHL_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(oppPayload)
      });
      if (!oppRes.ok) {
          const errorBody = await oppRes.text();
          throw new Error(`Opportunity creation failed: ${oppRes.status} ${errorBody}`);
      }
      const oppData = await oppRes.json();
      console.log("Opportunity created:", oppData);
      opportunitiesCreated++;
    } catch (error) {
      console.error("Error creating opportunity:", error);
    }
  }

  alert(`${opportunitiesCreated} of ${rows.length} opportunities processed successfully.`);
}

async function loadPipelines() {
    const pipelineDropdown = document.getElementById("pipelineDropdown");
    try {
      const res = await fetch(`https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`, {
        method: "GET",
        headers: {
          Authorization: GHL_TOKEN,
          Version: GHL_VERSION,
          Accept: "application/json"
        }
      });
  
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
  
      pipelineDropdown.innerHTML = `<option value="">-- Select pipeline --</option>`;
  
      (data.pipelines || []).forEach(pipeline => {
        const firstStage = (pipeline.stages || []).find(stage => stage.position === 1);
        if (!firstStage) return;
  
        const option = document.createElement("option");
        option.value = JSON.stringify({
          pipelineId: pipeline.id,
          stageId: firstStage.id
        });
        option.textContent = pipeline.name;
        if (pipeline.id === PIPELINE_ID) {
            option.selected = true;
        }
        pipelineDropdown.appendChild(option);
      });
  
    } catch (err) {
      console.error("Error loading pipelines:", err);
      pipelineDropdown.innerHTML = `<option value="">Error loading pipelines</option>`;
    }
  }