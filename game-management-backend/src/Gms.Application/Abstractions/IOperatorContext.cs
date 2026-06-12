using Gms.Domain.Entities;

namespace Gms.Application.Abstractions;

public interface IOperatorContext
{
    Operator? CurrentOperator { get; }
    void SetOperator(Operator op);
}

public sealed class OperatorContext : IOperatorContext
{
    public Operator? CurrentOperator { get; private set; }

    public void SetOperator(Operator op) => CurrentOperator = op;
}
