// Initialize the map centered on the United States
var map = L.map("map", {
  center: [37.8, -96],
  zoom: 4,
  scrollWheelZoom: true,
  tap: false,
  // Adjust the map to accommodate the info panel
  zoomControl: false,
});

L.control.zoom({ position: "topright" }).addTo(map);

// Add a base layer (Carto Light)
var light = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    attribution: "&copy; OpenStreetMap contributors",
  }
).addTo(map);

// Control layers
var controlLayers = L.control
  .layers(null, null, {
    position: "topright",
    collapsed: false,
  })
  .addTo(map);

controlLayers.addBaseLayer(light, "Carto Light basemap");

// Store all data
var allData = [];

// Load data from CSV
$.get("./data/pollution_data.csv", function (csvString) {
  allData = Papa.parse(csvString, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;

  // Set default date range inputs based on data
  var dates = allData
    .map(function (row) {
      return new Date(row.Date);
    })
    .filter(function (date) {
      return !isNaN(date);
    });

  if (dates.length === 0) {
    alert("No valid dates found in the data.");
    return;
  }

  var minDate = new Date(Math.min.apply(null, dates));
  var maxDate = new Date(Math.max.apply(null, dates));

  // Format dates to 'YYYY-MM-DD' for input[type=date]
  var minDateStr = minDate.toISOString().split("T")[0];
  var maxDateStr = maxDate.toISOString().split("T")[0];

  $("#start-date").val(minDateStr);
  $("#end-date").val(maxDateStr);

  // Initial processing and display
  processDataAndDisplayMarkers();
});

// Event listener for Update Map button
$("#update-map").on("click", function () {
  processDataAndDisplayMarkers();
});

function processDataAndDisplayMarkers() {
  // Remove existing markers
  if (window.markersLayer) {
    map.removeLayer(window.markersLayer);
  }

  // Get date range from inputs
  var startDate = new Date($("#start-date").val());
  var endDate = new Date($("#end-date").val());

  if (!startDate) {
    // If start date is invalid, set to earliest date in data
    var dates = allData
      .map(function (row) {
        return new Date(row.Date);
      })
      .filter(function (date) {
        return !isNaN(date);
      });
    startDate = new Date(Math.min.apply(null, dates));
  }

  if (!endDate) {
    // If end date is invalid, set to latest date in data
    var dates = allData
      .map(function (row) {
        return new Date(row.Date);
      })
      .filter(function (date) {
        return !isNaN(date);
      });
    endDate = new Date(Math.max.apply(null, dates));
  }

  // Filter data to selected date range
  var filteredData = allData.filter(function (row) {
    var date = new Date(row.Date);
    return date >= startDate && date <= endDate;
  });

  if (filteredData.length === 0) {
    alert("No data available for the selected date range.");
    return;
  }

  // Aggregate data per city
  var dataByCity = {};
  filteredData.forEach(function (row) {
    var cityKey = row.City + ", " + row.State;
    if (!dataByCity[cityKey]) {
      dataByCity[cityKey] = {
        City: row.City,
        State: row.State,
        latitude: row.latitude,
        longitude: row.longitude,
        count: 0,
        pm25_sum: 0,
        dataPoints: [],
      };
    }
    dataByCity[cityKey].count += 1;
    dataByCity[cityKey].pm25_sum += row.pm25_median || 0;
    dataByCity[cityKey].dataPoints.push(row);
  });

  window.markersLayer = L.featureGroup().addTo(map);

  // Define color scale for PM2.5 using D3
  var avgPm25Values = Object.values(dataByCity).map(function (d) {
    return d.pm25_sum / d.count;
  });
  var pm25Extent = d3.extent(avgPm25Values);
  var colorScale = d3
    .scaleSequential()
    .domain(pm25Extent)
    .interpolator(d3.interpolateReds);

  // For each city, create a marker
  Object.keys(dataByCity).forEach(function (cityKey) {
    var cityData = dataByCity[cityKey];
    var latitude = cityData.latitude;
    var longitude = cityData.longitude;

    // Check if latitude and longitude are valid numbers
    if (
      typeof latitude === "number" &&
      !isNaN(latitude) &&
      typeof longitude === "number" &&
      !isNaN(longitude)
    ) {
      // Calculate average PM2.5 for the city
      var avgPM25 = cityData.pm25_sum / cityData.count;

      // Create a marker with color based on average PM2.5
      var marker = L.circleMarker([latitude, longitude], {
        radius: 8,
        fillColor: colorScale(avgPM25),
        color: "#000",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      });

      // Add event listener for when the marker is clicked
      marker.on("click", function () {
        // Open info panel with city details
        showInfoPanel(cityData, startDate, endDate, colorScale, pm25Extent);
      });

      // Add marker to layer group
      window.markersLayer.addLayer(marker);
    }
  });

  // Adjust the map view to show all markers
  var groupBounds = window.markersLayer.getBounds();
  if (groupBounds.isValid()) {
    map.fitBounds(groupBounds);
  }

  // Add legend
  addLegend(colorScale, pm25Extent);
}

// Function to show info panel
function showInfoPanel(cityData, startDate, endDate, colorScale, pm25Extent) {
  var infoPanel = document.getElementById("info-panel");
  var infoContent = document.getElementById("info-content");

  // Format dates
  var startDateStr = startDate.toISOString().split("T")[0];
  var endDateStr = endDate.toISOString().split("T")[0];

  var cityDisplayStr = cityData.City?.toLowerCase()
    .split(" ")
    .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
    .join(" ");
  var stateDisplayStr =
    String(cityData.State).charAt(0).toUpperCase() +
    String(cityData.State).slice(1);
  // Create content
  var htmlContent = `
  <h2>${cityDisplayStr}, ${stateDisplayStr}</h2>
  <p><strong>Date Range:</strong> ${startDateStr} to ${endDateStr}</p>
  <p><strong>Average PM2.5:</strong> ${(
    cityData.pm25_sum / cityData.count
  ).toFixed(2)}</p>
  <div style="display: flex; align-items: center;">
    <label for="pollutant-select" style="flex-grow: 1;">Select Pollutant:</label>
  </div>
  <select id="pollutant-select">
    <option value="o3_median">O3</option>
    <option value="pm25_median">PM2.5</option>
    <option value="no2_median">NO2</option>
    <option value="so2_median">SO2</option>
    <option value="co_median">CO</option>
    <option value="pm10_median">PM10</option>
  </select>
  <label for="variable-select">Select Variable:</label>
  <select id="variable-select">
    <option value="mil_miles">MIL Miles</option>
    <option value="temperature_max">Temperature Max</option>
    <option value="dew_max">Dew Max</option>
  </select>
  <button id="fullscreen-chart" title="View Fullscreen" style="padding: 5px;">Full Screen View</button>
  <div id="pollutant-chart" class="chart"></div>
`;

  infoContent.innerHTML = htmlContent;

  // Show the panel
  infoPanel.classList.remove("hidden");

  // Add event listener to the dropdown
  // Add event listeners to the dropdowns
  var pollutantSelect = document.getElementById("pollutant-select");
  var variableSelect = document.getElementById("variable-select");

  pollutantSelect.addEventListener("change", function () {
    generatePollutantChart(
      cityData,
      pollutantSelect.value,
      variableSelect.value
    );
  });

  variableSelect.addEventListener("change", function () {
    generatePollutantChart(
      cityData,
      pollutantSelect.value,
      variableSelect.value
    );
  });

  // Generate initial chart
  generatePollutantChart(cityData, pollutantSelect.value, variableSelect.value);

  var fullscreenButton = document.getElementById("fullscreen-chart");
  fullscreenButton.addEventListener("click", function () {
    showFullscreenChart(cityData, pollutantSelect.value, variableSelect.value);
  });
  var closeButton = document.getElementById("close-info-panel");
  closeButton.addEventListener("click", function () {
    closeInfoPanel();
  });

  // Remove existing click listener to prevent multiple bindings
  map.off("click", closeInfoPanel);
  // Close panel when clicking outside
  map.on("click", closeInfoPanel);
}

// Function to close info panel
function closeInfoPanel() {
  var infoPanel = document.getElementById("info-panel");
  infoPanel.classList.add("hidden");
  map.off("click", closeInfoPanel);
}

// Function to generate pollutant chart
function generatePollutantChart(
  cityData,
  pollutant,
  variable,
  container,
  isFullscreen
) {
  container = container || d3.select("#pollutant-chart");

  // Clear previous content
  container.html("");

  var pollutantNames = {
    o3_median: "O3",
    pm25_median: "PM2.5",
    no2_median: "NO2",
    so2_median: "SO2",
    co_median: "CO",
    pm10_median: "PM10",
  };

  var variableNames = {
    mil_miles: "MIL Miles",
    temperature_max: "Temperature Max",
    dew_max: "Dew Max",
  };

  // Prepare data
  var parseDate = d3.timeParse("%Y-%m-%d"); // Adjust format as needed

  var pollutantData = cityData.dataPoints
    .map(function (d) {
      var parsedDate = parseDate(d.Date);
      var value = parseFloat(d[pollutant]);
      return {
        date: parsedDate,
        value: value,
      };
    })
    .filter(function (d) {
      return !isNaN(d.value) && d.date !== null;
    });

  var variableData = cityData.dataPoints
    .map(function (d) {
      var parsedDate = parseDate(d.Date);
      var value = parseFloat(d[variable]);
      return {
        date: parsedDate,
        value: value,
      };
    })
    .filter(function (d) {
      return !isNaN(d.value) && d.date !== null;
    });

  // Merge the data to get the overall x-axis domain
  var allDates = pollutantData
    .map((d) => d.date)
    .concat(variableData.map((d) => d.date));
  var xDomain = d3.extent(allDates);

  if (pollutantData.length > 0 || variableData.length > 0) {
    // Set dimensions for the chart
    var margin = { top: 20, right: 20, bottom: 50, left: 50 },
      width = (isFullscreen ? 700 : 300) - margin.left - margin.right,
      height = (isFullscreen ? 450 : 250) - margin.top - margin.bottom;

    // Create SVG
    var svg = container
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .style("margin-bottom", "20px")
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // Set the ranges
    var x = d3.scaleTime().range([0, width]).domain(xDomain);
    var y = d3.scaleLinear().range([height, 0]);

    // Combine values to get y-axis domain
    var allValues = pollutantData
      .map((d) => d.value)
      .concat(variableData.map((d) => d.value));
    var yMin = d3.min(allValues);
    var yMax = d3.max(allValues);

    if (yMin === yMax) {
      yMin = yMin - 1;
      yMax = yMax + 1;
    }

    y.domain([yMin, yMax]);

    // Define the line for pollutant
    var pollutantLine = d3
      .line()
      .x(function (d) {
        return x(d.date);
      })
      .y(function (d) {
        return y(d.value);
      });

    // Define the line for variable
    var variableLine = d3
      .line()
      .x(function (d) {
        return x(d.date);
      })
      .y(function (d) {
        return y(d.value);
      });

    // Add the pollutant line path.
    if (pollutantData.length > 0) {
      svg
        .append("path")
        .datum(pollutantData)
        .attr("class", "line pollutant-line")
        .attr("d", pollutantLine)
        .attr("stroke", "#1f77b4") // Original color
        .attr("stroke-width", 2)
        .attr("fill", "none");
    }

    // Add the variable line path.
    if (variableData.length > 0) {
      svg
        .append("path")
        .datum(variableData)
        .attr("class", "line variable-line")
        .attr("d", variableLine)
        .attr("stroke", "red") // Red color for the variable
        .attr("stroke-width", 2)
        .attr("fill", "none");
    }

    // Add the X Axis
    svg
      .append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%Y-%m-%d")))
      .selectAll("text")
      .attr("y", 10)
      .attr("x", -5)
      .attr("dy", ".35em")
      .attr("transform", "rotate(45)")
      .style("text-anchor", "start");

    // Add the Y Axis
    svg.append("g").call(d3.axisLeft(y));

    // Add title
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 0 - margin.top / 2 + 5)
      .attr("text-anchor", "middle")
      .style("font-size", isFullscreen ? "20px" : "16px")
      .text(pollutantNames[pollutant] + " and " + variableNames[variable]);

    // Add Y axis label
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left + 15)
      .attr("x", 0 - height / 2)
      .attr("dy", "-1em")
      .style("text-anchor", "middle")
      .text("Value");

    // Add a legend
    var legend = container.append("div").attr("class", "chart-legend");

    legend
      .append("div")
      .html(
        '<span style="background-color:#1f77b4;"></span>' +
          pollutantNames[pollutant]
      );

    legend
      .append("div")
      .html(
        '<span style="background-color:red;"></span>' + variableNames[variable]
      );
  } else {
    container
      .append("p")
      .text("No data available for the selected pollutant or variable.");
  }
}

// Function to add legend
function addLegend(colorScale, pm25Extent) {
  // Remove existing legend
  if (window.legendControl) {
    map.removeControl(window.legendControl);
  }

  var legend = L.control({ position: "bottomleft" });

  legend.onAdd = function (map) {
    var div = L.DomUtil.create("div", "legend");

    div.innerHTML += "<b>Avg PM2.5</b><br>";

    // Create a canvas to display the gradient
    var canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 10;

    var ctx = canvas.getContext("2d");

    // Create gradient
    var gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

    // Define gradient stops
    var numberOfStops = 10;
    var step = (pm25Extent[1] - pm25Extent[0]) / (numberOfStops - 1);
    for (var i = 0; i < numberOfStops; i++) {
      var value = pm25Extent[0] + step * i;
      gradient.addColorStop(i / (numberOfStops - 1), colorScale(value));
    }

    // Fill rectangle with gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add canvas to legend
    div.appendChild(canvas);

    // Add min and max labels
    var minLabel = document.createElement("span");
    minLabel.style.float = "left";
    minLabel.innerHTML = pm25Extent[0].toFixed(1);

    var maxLabel = document.createElement("span");
    maxLabel.style.float = "right";
    maxLabel.innerHTML = pm25Extent[1].toFixed(1);

    div.appendChild(minLabel);
    div.appendChild(maxLabel);

    return div;
  };

  legend.addTo(map);

  // Save the legend control to remove it later
  window.legendControl = legend;
}

function showFullscreenChart(cityData, pollutant, variable) {
  var modal = document.getElementById("chart-modal");
  var modalChartContainer = d3.select("#modal-chart");

  // Clear previous content
  modalChartContainer.html("");

  // Generate the chart in the modal
  generatePollutantChart(
    cityData,
    pollutant,
    variable,
    modalChartContainer,
    true
  );

  // Show the modal
  modal.classList.remove("hidden");

  // Close modal when clicking the close button
  var closeModalButton = document.getElementById("close-modal");
  closeModalButton.addEventListener("click", function () {
    modal.classList.add("hidden");
  });
}
