// --- DOM refs ---
const mvpTableContainer = document.getElementById("mvp-table-container");
const messageDiv = document.getElementById("message");
const createOpportunityBtn = document.getElementById("createOpportunityBtn");
const filtersContainer = document.getElementById("filters-container");
const pipelineDropdown = document.getElementById("pipelineDropdown");
const stageDropdown = document.getElementById("stageDropdown");
const refillsDaysInput = document.getElementById("refillsDaysInput");

// --- Config ---
const BASE_URL = "https://4p6i86w6ac.execute-api.us-east-2.amazonaws.com/test";
const API_KEY = "testing-12345";
const GHL_TOKEN = "Bearer pit-3398d27c-748d-4be6-9f55-683030bdc377";
const GHL_TOKEN_SUPERH = "Bearer pit-dcaef40d-3783-4aa9-a84f-88876be0a7da"
const GHL_VERSION = "2021-07-28";
const LOCATION_ID = "xWzbp40cgJND3UmZgNiS";

// --- Global state ---
let PIPELINE_ID = null;
let PIPELINE_STAGE_ID = null;
let pipelinesCache = [];

// --- Init ---
window.onload = async () => {
  await loadPipelines();
};

// --- Pipelines & Stages ---
async function loadPipelines() {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`,
      {
        method: "GET",
        headers: {
          Authorization: GHL_TOKEN,
          Version: GHL_VERSION,
          Accept: "application/json"
        }
      }
    );

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();

    pipelinesCache = Array.isArray(data.pipelines) ? data.pipelines : [];
    pipelineDropdown.innerHTML = `<option value="">-- Select pipeline --</option>`;

    pipelinesCache.forEach((pipeline) => {
      const opt = document.createElement("option");
      opt.value = pipeline.id;
      opt.textContent = pipeline.name;
      pipelineDropdown.appendChild(opt);
    });

    pipelineDropdown.onchange = () => {
      const id = pipelineDropdown.value;
      PIPELINE_ID = id || null;
      populateStagesForPipeline(id);
    };

    if (pipelinesCache.length > 0) {
      pipelineDropdown.value = pipelinesCache[0].id;
      PIPELINE_ID = pipelinesCache[0].id;
      populateStagesForPipeline(PIPELINE_ID);
    }
  } catch (err) {
    console.error("Error loading pipelines:", err);
    pipelineDropdown.innerHTML = `<option value="">Error loading pipelines</option>`;
    stageDropdown.innerHTML = `<option value="">--</option>`;
  }
}

function populateStagesForPipeline(pipelineId) {
  stageDropdown.innerHTML = "";
  stageDropdown.disabled = true;
  PIPELINE_STAGE_ID = null;

  const pipeline = pipelinesCache.find((p) => p.id === pipelineId);
  const stages = pipeline?.stages || [];

  if (!pipeline || stages.length === 0) {
    stageDropdown.innerHTML = `<option value="">-- No stages found --</option>`;
    return;
  }

  stages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  stageDropdown.innerHTML = `<option value="">-- Select stage --</option>`;
  stages.forEach((stage) => {
    const opt = document.createElement("option");
    opt.value = stage.id;
    opt.textContent = stage.name;
    stageDropdown.appendChild(opt);
  });

  stageDropdown.disabled = false;

  // default to first stage by position
  stageDropdown.value = stages[0].id;
  PIPELINE_STAGE_ID = stages[0].id;

  stageDropdown.onchange = () => {
    PIPELINE_STAGE_ID = stageDropdown.value || null;
  };
}

// --- Data fetch (pre-filtered by days) ---
async function fetchData() {
  messageDiv.textContent = "";
  mvpTableContainer.innerHTML = "";
  createOpportunityBtn.disabled = true;

  if (!PIPELINE_ID) {
    messageDiv.textContent = "Please select a pipeline first.";
    return;
  }
  if (!PIPELINE_STAGE_ID) {
    messageDiv.textContent = "Please select a stage.";
    return;
  }

  const daysValue = parseInt(refillsDaysInput.value, 10);
  if (Number.isNaN(daysValue) || daysValue <= 0) {
    messageDiv.textContent = "Please enter a valid number of days for 'Refills Coming Due'.";
    return;
  }

  try {
    const tableName = "vw_mvp_simple";
    const res = await fetch(`${BASE_URL}/get_data_from_columns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },
      body: JSON.stringify({
        table: tableName,
        daysDue: daysValue
      })
    });

    if (!res.ok) throw new Error(`HTTP error fetching data! status: ${res.status}`);
    const result = await res.json();

    if (!Array.isArray(result) || result.length === 0) {
      messageDiv.textContent = "No rows matched the given refills window.";
      return;
    }

    // Build table with ALL columns returned by backend
    const columns = Object.keys(result[0]);
    createTable(columns, result, mvpTableContainer);
    createOpportunityBtn.disabled = false;

    // After data is loaded, enable adding filters
    filtersContainer.innerHTML = ""; // reset any old filters
  } catch (e) {
    console.error(e);
    messageDiv.textContent = "Error fetching data.";
  }
}

// --- Client-side filters ---
function addFilterRow() {
  const row = document.createElement("div");
  row.classList.add("filter-row");

  // Get columns from current table header
  const table = mvpTableContainer.querySelector("table");
  const headers = table
    ? Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent)
    : [];

  const colSelect = document.createElement("select");

  // If no table yet, show a disabled single option
  if (headers.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Load data first";
    colSelect.appendChild(opt);
    colSelect.disabled = true;
  } else {
    headers.forEach((h) => {
      const option = document.createElement("option");
      option.value = h;
      option.textContent = h;
      colSelect.appendChild(option);
    });
  }

  const operatorSelect = document.createElement("select");
  ["=", ">", "<"].forEach((op) => {
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
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);

  // Dynamic filters
  const filters = Array.from(filtersContainer.querySelectorAll(".filter-row")).map((row) => {
    return {
      column: row.children[0].value,
      operator: row.children[1].value,
      value: row.children[2].value
    };
  });

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    let show = true;

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

      if (!show) break;
    }

    row.style.display = show ? "" : "none";
  });
}

// --- Table builder ---
function createTable(columns, data, container) {
  container.innerHTML = "";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  data.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] !== undefined ? row[col] : "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);
}

// --- Create Opportunities ---
async function createOpportunitiesFromTable() {
  const table = mvpTableContainer.querySelector("table");

  if (!table) {
    alert("No data table found. Please click 'Get Data' first.");
    return;
  }
  if (!PIPELINE_ID || !PIPELINE_STAGE_ID) {
    alert("Please select a pipeline and stage.");
    return;
  }

  const columns = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);
  const rows = Array.from(table.querySelectorAll("tbody tr")).filter((row) => row.style.display !== "none");

  let opportunitiesCreated = 0;
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    const selectedData = {};
    columns.forEach((col, idx) => {
      selectedData[col] = cells[idx]?.textContent.trim() || "";
    });

    // 1) Create/Retrieve Contact
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

    // 2) Create Opportunity in the selected pipeline + stage
    const oppPayload = {
      pipelineId: PIPELINE_ID,
      locationId: LOCATION_ID,
      name: `${selectedData["First Name"]} ${selectedData["Last Name"]}`,
      pipelineStageId: PIPELINE_STAGE_ID,
      status: "open",
      contactId,
      monetaryValue: 0,
      customFields: [
        { id: "RLBWVVvGDO15Szr92mpG", key: "opportunity.dependent_first_name", field_value: selectedData["First Name"] },
        { id: "t5LCdSTLec3uSIC1HQg9", key: "opportunity.dependent_last_name", field_value: selectedData["Last Name"] },
        { id: "VKuJVd605d77bNsalDxi", key: "opportunity.date_of_birth_rx", field_value: selectedData["Date of Birth"] },
        { id: "4RNP82sEuvd8FYwemvfp", key: "opportunity.patient_age", field_value: selectedData["Age"] },
        { id: "tS9YG2C0eTyzPa3uBKEN", key: "opportunity.next_refill_date", field_value: selectedData["Next refill date"] },
        { id: "takOv1oPpchD2mw0FlqP", key: "opportunity.medication_name", field_value: selectedData["Medication name"] },
        { id: "ElNn9vke04rTLPPE41Qu", key: "opportunity.refills_remaining", field_value: selectedData["Refills remaining"] },
        { id: "THKGZ1DPfsIOskX2Xxr0", key: "opportunity.primary_category", field_value: selectedData["Primary Category"] },
        { id: "MhX3oQfMbmmQDAaN6Rk0", key: "opportunity.primary_tp_bin", field_value: selectedData["Primary TP BIN"] },
        { id: "qnivc7LVe0JapYgNq1sw", key: "opportunity.primary_tp_pcn", field_value: selectedData["Primary TP PCN"] },
        { id: "fOgmPzJJNZGSNhWJ8cEA", key: "opportunity.primary_tp_group_number", field_value: selectedData["Primary TP Group Number"] },
        { id: "bZEO4i2DPeZScsOdJhJJ", key: "opportunity.insurance_mbi", field_value: selectedData["Primary Insurance MBI"] },
        { id: "QtoptYYdaxqJHv4Prj9q", key: "opportunity.serial_number", field_value: selectedData["Serial Number"] },
        { id: "ldBCHkqBTY8BEKwJEuNW", key: "opportunity.secondary_category", field_value: selectedData["Secondary Category"] },
        { id: "xdOoyGq9S0kfDEiTAglg", key: "opportunity.secondary_tp_bin", field_value: selectedData["Secondary TP BIN"] },
        { id: "jH96s68tncGPqNedLCVB", key: "opportunity.secondary_tp_pcn", field_value: selectedData["Secondary TP PCN"] },
        { id: "wmlaobFo1FoYSh9gQPgc", key: "opportunity.secondary_tp_group_number", field_value: selectedData["Secondary TP Group Number"] },
        { id: "u2KktwdAEbB7NyrGpYuP", key: "opportunity.secondary_insurance_mbi", field_value: selectedData["Secondary Insurance MBI"] },
        { id: "zrYzP24ax8iTbOTFNOnM", key: "opportunity.medication_name", field_value: selectedData["Medication name"] },
        { id: "xXhM4XBCCsCd7WzhOVaK", key: "opportunity.dispensed_item_name", field_value: selectedData["Dispensed Item Name"] }
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
