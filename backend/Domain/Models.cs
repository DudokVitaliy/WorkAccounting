static class Roles { public static bool Contains(string role) => role is "Admin" or "Master" or "Manager"; }
record LoginRequest(string Login, string Password);
record User(long Id, string Login, string Role);
