static class Schema
{
    public static readonly Dictionary<string, string> Tables = new() { ["contracts"] = "contracts", ["vehicles"] = "vehicles", ["sections"] = "sections", ["contract_works"] = "contract_works", ["works"] = "works", ["daily"] = "daily", ["section_daily_hours"] = "section_daily_hours", ["user_sections"] = "user_sections", ["users"] = "users", ["materials"] = "materials", ["work_materials"] = "work_materials", ["movements"] = "movements" };
    public static readonly Dictionary<string, string[]> Fields = new() { ["contracts"] = ["name", "code", "description", "status"], ["vehicles"] = ["contract_id", "number", "description"], ["sections"] = ["name"], ["contract_works"] = ["contract_id", "section_id", "name", "norm_hours", "description"], ["works"] = [], ["daily"] = [], ["section_daily_hours"] = [], ["user_sections"] = [], ["users"] = [], ["materials"] = ["name", "sku", "unit"], ["work_materials"] = ["work_id", "material_id", "quantity"], ["movements"] = [] };
}
