/* Household bread model. One attempted cycle produces one loaf. */
(() => {
  function mountCalculator() {
    const root = document.getElementById("bread-cost");
    if (!root) return;
    const assumptions = [
      ["flour", "Flour per cycle, including flour used to maintain starter (kg)", 0.50, 0.01],
      ["flourPrice", "Flour price ($/kg)", 1.60, 0.01],
      ["other", "Salt and other ingredients ($/cycle)", 0.04, 0.01],
      ["water", "Water and cleaning supplies ($/cycle)", 0.06, 0.01],
      ["power", "Electricity including baking and allocated standby use (kWh/cycle)", 1.20, 0.01],
      ["rate", "Electricity rate ($/kWh)", 0.20, 0.01],
      ["capital", "Installed equipment price including any plumbing ($)", 507.96, 0.01],
      ["years", "Service life (years)", 5, 1],
      ["cycles", "Attempted cycles per year", 300, 1],
      ["maintenance", "Parts and maintenance ($/year)", 30, 0.01],
      ["yield", "Usable loaves per 100 attempts", 95, 1],
      ["minutes", "Hands-on setup and cleaning (minutes/cycle)", 8, 0.1],
      ["hourly", "Optional value of household time ($/hour)", 15, 0.01],
      ["weight", "Baked weight per usable loaf (g)", 750, 1]
    ];
    root.innerHTML = `
      <h2>What would a loaf cost?</h2>
      <p>These editable assumptions represent a household baking one loaf per cycle. Replace the values with local prices and measured prototype results. Choose a prototype to load its installed price, then adjust any assumption.</p>
      <div class="bread-cost-summary" aria-live="polite"></div>
      <label>Prototype <select name="model"><option value="507.96">Refillable reservoir</option><option value="994.03">Plumbed refill</option></select></label><details><summary>Change the assumptions</summary>
        <div class="bread-cost-inputs"></div>
        <label><input type="checkbox" name="includeLabor"> Include household time in the total</label>
      </details>
      <p>Each usable loaf carries its share of failed cycles. Equipment cost is spread across the service life at the specified usage. Financing, resale value, and commercial overhead are outside this household estimate.</p>`;
    const fields = root.querySelector(".bread-cost-inputs");
    fields.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:1rem;margin:1rem 0";
    const controls = {};
    for (const [key, description, value, step] of assumptions) {
      const label = document.createElement("label");
      label.textContent = description;
      const input = document.createElement("input");
      input.type = "number";
      input.min = ["cycles", "years", "yield", "weight"].includes(key) ? "1" : "0";
      if (key === "yield") input.max = "100";
      input.step = String(step);
      input.value = value;
      input.required = true;
      input.style.cssText = "display:block;width:8rem;max-width:100%;font:inherit";
      controls[key] = input;
      label.append(input);
      fields.append(label);
    }
    const dollars = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"});
    const totalText = root.querySelector(".bread-cost-summary");
    function calculate() {
      if (Object.values(controls).some(input => !input.validity.valid)) {
        totalText.textContent = "Check the highlighted inputs to calculate a valid cost.";
        return;
      }
      const v = Object.fromEntries(Object.entries(controls).map(([k, input]) => [k, input.valueAsNumber]));
      const fraction = v.yield / 100;
      const ingredients = (v.flour * v.flourPrice + v.other) / fraction;
      const utilities = (v.water + v.power * v.rate) / fraction;
      const equipment = (v.capital / v.years + v.maintenance) / (v.cycles * fraction);
      const time = v.minutes * v.hourly / (60 * fraction);
      const includeTime = root.querySelector("[name=includeLabor]").checked;
      const total = ingredients + utilities + equipment + (includeTime ? time : 0);
      const title = document.createElement("strong");
      title.textContent = dollars.format(total) + " per usable loaf";
      const detail = document.createElement("p");
      detail.textContent = "Ingredients " + dollars.format(ingredients) + " · Power, water and cleaning " + dollars.format(utilities) + " · Equipment and upkeep " + dollars.format(equipment) + " · Household time " + dollars.format(time) + (includeTime ? " included." : " optional.");
      const perWeight = document.createElement("p");
      perWeight.textContent = dollars.format(total * 100 / v.weight) + " per 100 g at a baked weight of " + v.weight + " g.";
      totalText.replaceChildren(title, detail, perWeight);
    }
    root.querySelector("[name=model]").addEventListener("change", event => {
      controls.capital.value = event.target.value;
      calculate();
    });
    root.addEventListener("input", calculate);
    calculate();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountCalculator);
  else mountCalculator();
})();
