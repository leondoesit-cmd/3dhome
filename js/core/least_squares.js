// Dense least-squares numerics, shared by the 2D sketch solver and the 3D
// assembly mate solver.
//
// Both solvers are damped Gauss-Newton (Levenberg-Marquardt) over a vector of
// residuals that should all be zero: build a Jacobian by finite differences,
// solve the normal equations for a step, accept it if the error fell and raise
// the damping if it did not. Only the residuals differ between them — a sketch
// measures distances and angles between 2D entities, an assembly measures how
// far each mate is from being honoured — so the numerics live here and each
// solver supplies its own residual function.
//
// The rank of the Jacobian at the solution is what turns into a degrees-of-
// freedom count in both, which is why rankOf sits here too rather than in
// either caller.

/* Numerical Jacobian of `evaluate` at `x`.
 *
 * `evaluate(vector)` must write the vector into whatever state it describes
 * and return the residuals for it; it is called once per variable (twice with
 * `central`), so it has to be cheap and free of side effects beyond that state.
 * The caller is responsible for restoring `x` afterwards — this function
 * leaves the state at whatever the last probe wrote.
 *
 * Forward differences cost one evaluation per column and are accurate to
 * O(h); central differences cost two and are accurate to O(h²), which is what
 * lets a solve converge far enough that the answer rounds to a clean number
 * instead of landing a few parts in a billion away from one. Sketches drag at
 * 60fps and take the cheap one; assemblies are small and take the accurate
 * one. */
export function numericJacobian(evaluate, x, base, options = {}) {
  const central = options.central === true;
  const rows = base.length, columns = x.length;
  const J = Array.from({ length: rows }, () => Array(columns).fill(0));
  for (let j = 0; j < columns; j++) {
    const old = Number(x[j]) || 0;
    const h = Math.max(options.step || 1e-5, Math.abs(old) * 1e-6);
    x[j] = old + h;
    const plus = evaluate(x);
    let minus = base, span = h;
    if (central) {
      x[j] = old - h;
      minus = evaluate(x);
      span = 2 * h;
    }
    x[j] = old;
    for (let i = 0; i < rows; i++) J[i][j] = ((plus[i] || 0) - (minus[i] || 0)) / span;
  }
  evaluate(x);
  return J;
}

/* Gauss-Jordan solve of a dense square system. Columns whose pivot is
   numerically zero are left alone rather than blowing up: an unconstrained
   variable simply gets no step, which is the right answer for it. */
export function solveLinear(A, b) {
  const n = b.length, M = A.map((row, i) => row.slice().concat(b[i]));
  const pivots=[];
  // Row rank and variable column are independent in a singular system.
  // A skipped column must not discard a row that constrains a later variable.
  for (let col=0,row=0;col<n&&row<n;col++) {
    let pivot=row;
    for(let i=row+1;i<n;i++)if(Math.abs(M[i][col])>Math.abs(M[pivot][col]))pivot=i;
    if(Math.abs(M[pivot][col])<1e-12)continue;
    [M[row],M[pivot]]=[M[pivot],M[row]];
    const d=M[row][col];for(let j=col;j<=n;j++)M[row][j]/=d;
    for(let i=0;i<n;i++){if(i===row)continue;const f=M[i][col];for(let j=col;j<=n;j++)M[i][j]-=f*M[row][j];}
    pivots.push(col);row++;
  }
  const solution=Array(n).fill(0);
  pivots.forEach((col,row)=>{solution[col]=Number.isFinite(M[row][n])?M[row][n]:0;});
  return solution;
}

/* Rank of a Jacobian, which is what turns into the degrees-of-freedom count.
   Rows are equilibrated to unit maximum first: the residuals are not in the
   same units — a distance is centimetres while a parallel relation is a
   normalized cross product — so their rows differ in magnitude by whatever the
   model happens to be scaled to. Against a fixed absolute pivot tolerance,
   that made the *same shape* rank differently at 40 cm and at 150 cm, and a
   fully defined sketch drawn large reported phantom freedoms. After scaling,
   every row's largest entry is 1 and the tolerance means the same thing on all
   of them. */
export function rankOf(J, tolerance = 1e-9) {
  if (!J.length || !J[0]?.length) return 0;
  const M = J.map((r) => {
    const row = r.slice();
    let peak = 0;
    for (const v of row) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) for (let i = 0; i < row.length; i++) row[i] /= peak;
    return row;
  });
  let rank = 0, col = 0;
  while (rank < M.length && col < M[0].length) {
    let pivot = rank;
    for (let i = rank + 1; i < M.length; i++) if (Math.abs(M[i][col]) > Math.abs(M[pivot][col])) pivot = i;
    if (Math.abs(M[pivot][col]) <= tolerance) { col++; continue; }
    [M[rank], M[pivot]] = [M[pivot], M[rank]];
    for (let i = rank + 1; i < M.length; i++) {
      const f = M[i][col] / M[rank][col];
      for (let j = col; j < M[0].length; j++) M[i][j] -= f * M[rank][j];
    }
    rank++; col++;
  }
  return rank;
}

export function normOf(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/* One damped Gauss-Newton step: solve (JᵀJ + λI)δ = -Jᵀr and return δ.
   Kept apart from the loops so both solvers form the step the same way even
   though they accept and reject it differently — the sketch reverts variables
   on an object graph, the assembly re-poses components. */
export function gaussNewtonStep(J, r, damping) {
  const n = J[0]?.length || 0;
  const A = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
  for (let i = 0; i < r.length; i++) for (let j = 0; j < n; j++) {
    b[j] -= J[i][j] * r[i];
    for (let k = 0; k < n; k++) A[j][k] += J[i][j] * J[i][k];
  }
  for (let i = 0; i < n; i++) A[i][i] += damping;
  return solveLinear(A, b);
}
