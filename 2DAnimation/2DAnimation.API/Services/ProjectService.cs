using _2DAnimation.API.Data;
using _2DAnimation.API.DTOs;
using _2DAnimation.API.Entities;
using Microsoft.EntityFrameworkCore;

namespace _2DAnimation.API.Services;

public class ProjectService(AppDbContext db) : IProjectService
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
}
