using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;

sealed class Store(string cs)
{
    public SqliteConnection Open() { var c = new SqliteConnection(cs); c.Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=15000;"; cmd.ExecuteNonQuery(); return c; }
    public void Exec(string sql, params (string, object?)[] args) { using var c = Open(); using var cmd = Cmd(c, sql, args); cmd.ExecuteNonQuery(); }
    public long Insert(string sql, params (string, object?)[] args) { using var c = Open(); using var cmd = Cmd(c, sql + "; SELECT last_insert_rowid();", args); return Convert.ToInt64(cmd.ExecuteScalar()); }
    public double Number(string sql, params (string, object?)[] args) { using var c = Open(); using var cmd = Cmd(c, sql, args); return Convert.ToDouble(cmd.ExecuteScalar()); }
    public long Scalar(string sql, params (string, object?)[] args) { using var c = Open(); using var cmd = Cmd(c, sql, args); return Convert.ToInt64(cmd.ExecuteScalar()); }
    public Dictionary<string, object?>? One(string sql, params (string, object?)[] args) => All(sql, args).FirstOrDefault();
    public List<Dictionary<string, object?>> All(string sql, params (string, object?)[] args) { using var c = Open(); using var cmd = Cmd(c, sql, args); using var reader = cmd.ExecuteReader(); return ReadRows(reader); }
    static SqliteCommand Cmd(SqliteConnection c, string sql, (string, object?)[] args, SqliteTransaction? tx = null) { var cmd = c.CreateCommand(); cmd.Transaction = tx; cmd.CommandText = sql; foreach (var (k, v) in args) cmd.Parameters.AddWithValue(k, v ?? DBNull.Value); return cmd; }
    static List<Dictionary<string, object?>> ReadRows(SqliteDataReader r) { var result = new List<Dictionary<string, object?>>(); while (r.Read()) result.Add(Enumerable.Range(0, r.FieldCount).ToDictionary(r.GetName, i => r.IsDBNull(i) ? null : r.GetValue(i))); return result; }
    public static List<Dictionary<string, object?>> Rows(SqliteConnection c, SqliteTransaction tx, string sql, params (string, object?)[] args) { using var cmd = Cmd(c, sql, args, tx); using var r = cmd.ExecuteReader(); return ReadRows(r); }
    public static Dictionary<string, object?>? Row(SqliteConnection c, SqliteTransaction tx, string sql, params (string, object?)[] args) => Rows(c, tx, sql, args).FirstOrDefault();
    public static long Scalar(SqliteConnection c, SqliteTransaction tx, string sql, params (string, object?)[] args) { using var cmd = Cmd(c, sql, args, tx); return Convert.ToInt64(cmd.ExecuteScalar()); }
    public static int Execute(SqliteConnection c, SqliteTransaction tx, string sql, params (string, object?)[] args) { using var cmd = Cmd(c, sql, args, tx); return cmd.ExecuteNonQuery(); }
    public void SeedAdmin(string password) { if (Scalar("SELECT COUNT(*) FROM users WHERE role='Admin'") > 0) return; if (password.Length < 10) throw new Exception("WORK_ADMIN_PASSWORD має містити щонайменше 10 символів"); Insert("INSERT INTO users(login,password_hash,role,active) VALUES('admin',@p,'Admin',1)", ("@p", new PasswordHasher<string>().HashPassword("admin", password))); }
    public void Init() { using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = """
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,login TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('Admin','Manager','Master')),active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contracts(id INTEGER PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Active');
    CREATE TABLE IF NOT EXISTS sections(id INTEGER PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE);
    CREATE TABLE IF NOT EXISTS vehicles(id INTEGER PRIMARY KEY,contract_id INTEGER NOT NULL REFERENCES contracts(id),number TEXT NOT NULL COLLATE NOCASE UNIQUE,description TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS contract_works(id INTEGER PRIMARY KEY,contract_id INTEGER NOT NULL REFERENCES contracts(id),section_id INTEGER NOT NULL REFERENCES sections(id),name TEXT NOT NULL,norm_hours REAL NOT NULL DEFAULT 0 CHECK(norm_hours>=0),description TEXT NOT NULL DEFAULT '',UNIQUE(contract_id,section_id,name));
    CREATE TABLE IF NOT EXISTS works(id INTEGER PRIMARY KEY,vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),contract_work_id INTEGER NOT NULL REFERENCES contract_works(id),progress REAL NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=100),UNIQUE(vehicle_id,contract_work_id));
    CREATE TABLE IF NOT EXISTS daily(id INTEGER PRIMARY KEY,work_id INTEGER NOT NULL REFERENCES works(id),user_id INTEGER NOT NULL REFERENCES users(id),date TEXT NOT NULL,percent REAL NOT NULL CHECK(percent>0 AND percent<=100),norm_hours REAL NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS section_daily_hours(id INTEGER PRIMARY KEY,contract_id INTEGER NOT NULL REFERENCES contracts(id),section_id INTEGER NOT NULL REFERENCES sections(id),date TEXT NOT NULL,hours REAL NOT NULL CHECK(hours>=0),user_id INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL,UNIQUE(contract_id,section_id,date));
    CREATE TABLE IF NOT EXISTS user_sections(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,UNIQUE(user_id,section_id));
    CREATE TABLE IF NOT EXISTS materials(id INTEGER PRIMARY KEY,name TEXT NOT NULL,sku TEXT NOT NULL DEFAULT '',unit TEXT NOT NULL DEFAULT 'шт',balance REAL NOT NULL DEFAULT 0 CHECK(balance>=0));
    CREATE TABLE IF NOT EXISTS work_materials(id INTEGER PRIMARY KEY,work_id INTEGER NOT NULL REFERENCES works(id),material_id INTEGER NOT NULL REFERENCES materials(id),quantity REAL NOT NULL CHECK(quantity>0),UNIQUE(work_id,material_id));
    CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,material_id INTEGER NOT NULL REFERENCES materials(id),work_id INTEGER REFERENCES works(id),quantity REAL NOT NULL CHECK(quantity>0),kind TEXT NOT NULL CHECK(kind IN ('Receipt','WriteOff')),created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_daily_date ON daily(date);
    CREATE INDEX IF NOT EXISTS idx_hours_date ON section_daily_hours(date);
    CREATE TRIGGER IF NOT EXISTS vehicle_works_insert AFTER INSERT ON vehicles BEGIN
      INSERT INTO works(vehicle_id,contract_work_id) SELECT NEW.id,id FROM contract_works WHERE contract_id=NEW.contract_id;
    END;
    CREATE TRIGGER IF NOT EXISTS contract_works_insert AFTER INSERT ON contract_works BEGIN
      INSERT INTO works(vehicle_id,contract_work_id) SELECT id,NEW.id FROM vehicles WHERE contract_id=NEW.contract_id;
    END;
    CREATE TRIGGER IF NOT EXISTS vehicle_contract_update BEFORE UPDATE OF contract_id ON vehicles WHEN NEW.contract_id<>OLD.contract_id BEGIN SELECT RAISE(ABORT,'Не можна змінювати контракт автомобіля'); END;
    CREATE TRIGGER IF NOT EXISTS contract_work_scope_update BEFORE UPDATE OF contract_id,section_id ON contract_works BEGIN SELECT RAISE(ABORT,'Не можна змінювати контракт або дільницю роботи'); END;
    """; cmd.ExecuteNonQuery(); }
}
