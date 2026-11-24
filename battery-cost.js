/* Household battery buffering model. Backup hours for critical loads and cost per kWh delivered. */
(() => {
  function mountCalculator() {
    const root = document.getElementById("battery-cost");
    if (!root) return;
    // [key, label, default, step, min, max]
    // Load defaults are assumptions for illustration. Replace them with nameplate or metered values.
    const loads = [
      ["fridge", "Refrigerator, average draw (kW)", 0.15, 0.01, 0],
      ["heat", "Furnace blower or boiler pump (kW)", 0.50, 0.01, 0],
      ["sump", "Sump pump, averaged over its cycling (kW)", 0.20, 0.01, 0],
      ["well", "Well pump, averaged over its cycling (kW)", 0.00, 0.01, 0],
      ["lights", "Lights, internet and phone charging (kW)", 0.20, 0.01, 0],
      ["medical", "Medical equipment (kW)", 0.00, 0.01, 0],
      ["other", "Other critical loads (kW)", 0.00, 0.01, 0]
    ];
    const system = [
      ["capacity", "Usable battery capacity (kWh)", 60, 0.1, 0.1],
      ["charge", "Charge level when the outage starts (%)", 100, 1, 1, 100],
      ["deliver", "Share of stored energy reaching the outlets (%)", 90, 1, 1, 100],
      ["inverter", "Inverter continuous output, battery only (kW)", 15, 0.1, 0.1]
    ];
    const cost = [
      ["installed", "Installed cost, including allowances ($)", 26167, 0.01, 0],
      ["cycles", "Rated full cycles over the battery's life", 4533, 1, 1],
      ["perYear", "Full cycles used per year", 300, 1, 1],
      ["years", "Service life (years)", 15, 1, 1],
      ["roundTrip", "Round-trip efficiency, grid to outlet (%)", 90, 1, 1, 100],
      ["rate", "Electricity price used to charge ($/kWh)", 0.2220, 0.0001, 0]
    ];
    root.innerHTML = `
      <h2>How long would it run, and what does a stored kWh cost?</h2>
      <p>Enter the average power each critical load draws during an outage and the battery you plan to install. Defaults marked as assumptions are illustrations, not measurements. The capacity, inverter output and cycle defaults come from the reference unit’s spec sheet. The electricity price is EIA’s preliminary Pennsylvania residential average for September 2026.</p>
      <div class="battery-cost-summary" aria-live="polite"></div>
      <details open><summary>Critical loads (assumptions, kW)</summary><div class="battery-cost-inputs" data-group="loads"></div></details>
      <details><summary>Battery and inverter</summary><div class="battery-cost-inputs" data-group="system"></div></details>
      <details><summary>Cost per kWh delivered</summary><div class="battery-cost-inputs" data-group="cost"></div></details>
      <p>Backup hours assume steady average loads. Motors and compressors draw several times their running power when they start, so check starting current against the inverter’s surge rating separately. Cost per kWh spreads the installed price over the energy the battery delivers in its life: the smaller of its rated cycles or the cycles it can actually use in its service life. Financing, replacement parts, outage-avoided losses and any incentive are outside this estimate.</p>`;
    const controls = {};
    function build(list, group) {
      const box = root.querySelector(`[data-group=${group}]`);
      box.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:1rem;margin:1rem 0";
      for (const [key, description, value, step, min, max] of list) {
        const label = document.createElement("label");
        label.textContent = description;
        const input = document.createElement("input");
        input.type = "number";
        input.name = key;
        input.min = String(min);
        if (max !== undefined) input.max = String(max);
        input.step = String(step);
        input.value = value;
        input.required = true;
        input.style.cssText = "display:block;width:8rem;max-width:100%;font:inherit";
        controls[key] = input;
        label.append(input);
        box.append(label);
      }
    }
    build(loads, "loads");
    build(system, "system");
    build(cost, "cost");
    const dollars = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"});
    const cents = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3});
    const number = new Intl.NumberFormat("en-US", {maximumFractionDigits: 1});
    const kw = new Intl.NumberFormat("en-US", {maximumFractionDigits: 2});
    const summary = root.querySelector(".battery-cost-summary");
    function calculate() {
      for (const input of Object.values(controls)) {
        const bad = !input.validity.valid;
        input.setAttribute("aria-invalid", String(bad));
        input.style.outline = bad ? "3px solid #b3261e" : "";
        input.style.outlineOffset = bad ? "1px" : "";
      }
      if (Object.values(controls).some(input => !input.validity.valid)) {
        summary.textContent = "Check the highlighted inputs to calculate a valid estimate.";
        return;
      }
      const v = Object.fromEntries(Object.entries(controls).map(([k, input]) => [k, input.valueAsNumber]));
      const load = loads.reduce((sum, [key]) => sum + v[key], 0);
      const available = v.capacity * (v.charge / 100) * (v.deliver / 100);
      const hours = document.createElement("strong");
      if (load > 0) {
        const h = available / load;
        hours.textContent = number.format(h) + " hours of backup (" + number.format(h / 24) + " days) at " + kw.format(load) + " kW of critical load";
      } else {
        hours.textContent = "Enter at least one critical load to estimate backup hours";
      }
      const energy = document.createElement("p");
      energy.textContent = number.format(available) + " kWh reaches the outlets from a " + number.format(v.capacity) + " kWh battery at " + v.charge + "% charge.";
      const warn = document.createElement("p");
      warn.textContent = load > v.inverter
        ? "Warning: the combined load exceeds the inverter’s " + number.format(v.inverter) + " kW continuous output. Shed loads or add inverter capacity."
        : "The combined load is within the inverter’s " + number.format(v.inverter) + " kW continuous output.";
      if (load > v.inverter) warn.style.color = "#b3261e";
      const usedCycles = Math.min(v.cycles, v.perYear * v.years);
      const delivered = usedCycles * v.capacity * (v.deliver / 100);
      const storage = v.installed / delivered;
      const charging = v.rate / (v.roundTrip / 100);
      const perKwh = document.createElement("strong");
      perKwh.textContent = cents.format(storage + charging) + " per kWh delivered";
      const detail = document.createElement("p");
      detail.textContent = "Equipment and installation " + cents.format(storage) + " · Charging electricity " + cents.format(charging) + " · " + number.format(usedCycles) + " full cycles delivering about " + number.format(delivered / 1000) + " MWh" + (usedCycles < v.cycles ? ", limited by service life rather than rated cycles." : ", limited by rated cycles.");
      const compare = document.createElement("p");
      compare.textContent = "For comparison, grid power at the entered price costs " + cents.format(v.rate) + " per kWh. Storage pays for itself on cost alone only if the household can charge at a much lower price than it avoids, or values outage protection.";
      const wrap = document.createElement("div");
      wrap.append(hours, energy, warn, perKwh, detail, compare);
      summary.replaceChildren(wrap);
    }
    root.addEventListener("input", calculate);
    calculate();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountCalculator);
  else mountCalculator();
})();
