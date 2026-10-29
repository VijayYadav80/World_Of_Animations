using System.Text.Json;
using _2DAnimation.API.Data;
using _2DAnimation.API.DTOs;
using _2DAnimation.API.Entities;
using Microsoft.EntityFrameworkCore;

namespace _2DAnimation.API.Services;

public class ProjectService(AppDbContext db, IProjectFileStore files) : IProjectService
{
    public async Task<IReadOnlyList<ProjectSummaryDto>> ListAsync(CancellationToken ct)
    {
        return await db.Projects
            .AsNoTracking()
            .OrderByDescending(p => p.UpdatedUtc)
            .Select(p => new ProjectSummaryDto(p.Id, p.Name, p.CreatedUtc, p.UpdatedUtc))
            .ToListAsync(ct);
    }

    public async Task<ProjectSummaryDto> CreateAsync(CreateProjectRequest request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var project = new Project
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            CreatedUtc = now,
            UpdatedUtc = now
        };

        db.Projects.Add(project);
        await db.SaveChangesAsync(ct);

        return new ProjectSummaryDto(project.Id, project.Name, project.CreatedUtc, project.UpdatedUtc);
    }

    public async Task<ProjectDetailDto?> GetAsync(Guid id, CancellationToken ct)
    {
        return await db.Projects
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProjectDetailDto(p.Id, p.Name, p.SceneJson, p.CreatedUtc, p.UpdatedUtc))
            .FirstOrDefaultAsync(ct);
    }

    public async Task<ProjectSummaryDto?> SaveAsync(Guid id, SaveProjectRequest request, CancellationToken ct)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (project is null) return null;

        // Never store something that is not valid JSON: it would make the project impossible to open later.
        using (JsonDocument.Parse(request.SceneJson)) { }

        project.Name = request.Name.Trim();
        project.SceneJson = request.SceneJson;
        project.UpdatedUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return new ProjectSummaryDto(project.Id, project.Name, project.CreatedUtc, project.UpdatedUtc);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (project is null) return false;

        db.Projects.Remove(project);
        await db.SaveChangesAsync(ct);
        files.DeleteProject(id); // the audio files go with the project
        return true;
    }

    public Task<bool> ExistsAsync(Guid id, CancellationToken ct)
        => db.Projects.AsNoTracking().AnyAsync(p => p.Id == id, ct);
}
