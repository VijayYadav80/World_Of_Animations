using _2DAnimation.API.Entities;
using Microsoft.EntityFrameworkCore;

namespace _2DAnimation.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(e =>
        {
            e.ToTable("Projects");
            e.HasKey(p => p.Id);
            e.Property(p => p.Name).IsRequired().HasMaxLength(200);
            e.Property(p => p.SceneJson).IsRequired().HasColumnType("nvarchar(max)");
            e.HasIndex(p => p.UpdatedUtc);
        });
    }
}
