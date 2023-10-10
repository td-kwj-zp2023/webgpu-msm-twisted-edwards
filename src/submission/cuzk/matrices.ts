import * as Interface from './interfaces';
import { assert } from 'console';

/**
 * Dense Matrix Class
 */
export class DenseMatrix implements Interface.DenseMatrix {  
    public data: any[];
    public num_rows: number;
    public num_columns: number;
    
    constructor(matrix: any[] = []) {
        this.data = matrix ? matrix : [];
        this.num_rows = matrix ? matrix.length : 0;
        this.num_columns = matrix.length > 0 ? matrix[0].length : 0;
    }

    async transpose(): Promise<DenseMatrix> {
        // Initalize transposed matrix as 2D list
        const transposedMatrix: number[][] = [];
        for (let j = 0; j < this.num_columns; j++) {
            transposedMatrix[j] = [];
        }
    
        // Perform transpose 
        for (let i = 0; i < this.num_rows; i++) {
            for (let j = 0; j < this.num_columns; j++) {
                transposedMatrix[j][i] = this.data[i][j]
            }
        }

        return new DenseMatrix(transposedMatrix);
    }

    async matrix_vec_mult(vec: number[]): Promise<number[]> {
        assert(this.num_columns == vec.length)

        let matrix = Array(this.num_rows).fill(0);
        for (const [i, j] of this.data.entries()) {
            for (const [position, value] of j.entries()) {
                if (value != null) {
                    matrix[i] += value * vec[position]
                }
            }
        }

        return matrix
    }
}

/**
 * ELL Sparse Matrix Class
 */
export class ELLSparseMatrix implements Interface.ELLSparseMatrix {  
    public data: any[];
    public col_idx: any[];
    public row_length: any[];

    constructor(matrix: any[] = [], col_idx: any[] = [], row_length: any[] = []) {
        this.data = matrix ? matrix : [];
        this.col_idx = matrix ? col_idx : [];
        this.row_length = matrix ? row_length : [];
    }

    async dense_to_sparse_matrix(dense_matrix: DenseMatrix): Promise<ELLSparseMatrix> {
        // Linearly scan the matrix to determine the row-space
        let row_space = 0
        for (const row of dense_matrix.data) {
            let num_vals_for_this_row = 0
            for (const val of row) {
                if (val != null) {
                    num_vals_for_this_row++
                }
            }

            if (num_vals_for_this_row > row_space) {
                row_space = num_vals_for_this_row
            }
        }

        // Initialize ELL sparse matrix 
        let sparse_matrix: number[][] = [];
        let col_idx: number[][] = [];
        let row_length = []

        for (const [i, j] of dense_matrix.data.entries()) { 
            let z = 0
            sparse_matrix[i] = [null as any];
            col_idx[i] = [null as any];
            for (const [position, value] of j.entries()) { 
                if (value != null) {
                    sparse_matrix[i][z] = value
                    col_idx[i][z] = position
                    z += 1
                }
            }
            row_length.push(z)

            for (z; z < row_space; z++) {
                sparse_matrix[i][z] = null as any
                col_idx[i][z] = null as any
            }
        }

        // return ELLSparseMatrix(sparse_matrix, col_idx, row_length)
        return new ELLSparseMatrix(sparse_matrix, col_idx, row_length);
    }

    async sparse_to_dense_matrix(sparse_matrix: ELLSparseMatrix): Promise<DenseMatrix> {
        console.log("Not Implemented Yet!")
        return Promise.resolve(new DenseMatrix([]))
    }
}

/**
 * CSR Sparse Matrix Class
 */
export class CSRSparseMatrix implements Interface.CSRSparseMatrix {  
    public data: any[];
    public col_idx: any[];
    public row_ptr: any[];

    constructor(matrix: any[] = [], col_idx: any[] = [], row_ptr: any[] = []) {
        this.data = matrix ? matrix : [];
        this.col_idx = matrix ? col_idx : [];
        this.row_ptr = matrix ? row_ptr : [];
    }

    async ell_to_csr_sparse_matrix(ell_sparse_matrix: ELLSparseMatrix): Promise<CSRSparseMatrix> {
        const sparse_matrix = []
        const col_idx = []
        const row_ptr = []

        // Fill sparse matrix
        for (const i of ell_sparse_matrix.data) {
            for (const [position, value] of i.entries()) {
                if (value != null) {
                    sparse_matrix.push(value)
                }
            }
        }

        // Fill col_idx
        for (const i of ell_sparse_matrix.col_idx) {
            for (const value of i) {
                if (value != null) {
                    col_idx.push(value)
                }
            }
        }

        // Fill row_ptr   
        row_ptr.push(0)
        for (const [i, j] of ell_sparse_matrix.data.entries()) {
            let z = 0
            for (const [position, value] of j.entries()) {
                if (value != null) {
                    z += 1
                }
            }
            row_ptr.push(z + row_ptr[i])
        }

        return new CSRSparseMatrix(sparse_matrix, col_idx, row_ptr);
    }

    async dense_to_sparse_matrix(dense_matrix: DenseMatrix): Promise<CSRSparseMatrix> {
        console.log("Not Implemented Yet!")
        return Promise.resolve(new CSRSparseMatrix([], [], []))
    }

    async sparse_to_dense_matrix(sparse_matrix: CSRSparseMatrix): Promise<DenseMatrix> {
        console.log("Not Implemented Yet!")
        return Promise.resolve(new DenseMatrix([]))
    }

    // Perform SMTVP. See https://ieeexplore.ieee.org/document/7097920, Figure 2b.
    async smtvp(vec: number[]): Promise<number[]> {
        // Check if vector length equals the number of rows
        assert(vec.length == this.row_ptr.length - 1)

        // Determine maximum col_idx value
        let max_col_idx = 0
        for (const i of this.col_idx) {
            if (i > max_col_idx) {
                max_col_idx = i
            }
        }

        let result = Array(max_col_idx + 1).fill(0);
        for (let i = 0; i < vec.length; i++) {
            let row_begin = this.row_ptr[i]
            let row_end = this.row_ptr[i + 1]
            for (let j = row_begin; j < row_end; j++) {
                result[this.col_idx[j]] += this.data[j] * vec[i]
            }
        }

        return result
    }

    // See https://ieeexplore.ieee.org/document/7097920, Figure 4.
    async smtvp_parallel(vec: number[]): Promise<number[]> {
        console.log("Not Implemented Yet!")
        return Promise.resolve([]);
    }

    // See https://stackoverflow.com/questions/49395986/compressed-sparse-row-transpose
    async transpose(): Promise<CSRSparseMatrix> {
        // Number of rows, columns, non-zero elements
        let n = this.row_ptr.length - 1

        let m = 0
        for (const i of this.col_idx) {
            if (i > m) {
                m = i
            }
        }

        m += 1
        let nz = this.data.length

        // Initialize data for transposed sparse matrix
        let sparse_matrix = Array(nz).fill(0);
        let col_idx = Array(nz).fill(0);
        let row_ptr = Array(m + 1).fill(0);

        // Calculate count per columns
        for (let i = 0; i < nz; i++) {
            row_ptr[this.col_idx[i] + 2] += 1
        }

        // From count per columns generate new rowPtr (but shifted)
        for (let i = 2; i < row_ptr.length; i++) {
            // Calculate incremental sum
            row_ptr[i] += row_ptr[i - 1]
        }

        // Perform the main part
        for (let i = 0; i < n; i++) {
            for (let j = this.row_ptr[i]; j < this.row_ptr[i + 1]; j++) {
                // Calculate index to transposed matrix at which we should place current element,
                // and at the same time build final rowPtr
                let new_index = row_ptr[this.col_idx[j] + 1]
                row_ptr[this.col_idx[j] + 1] += 1
                sparse_matrix[new_index] = this.data[j]
                col_idx[new_index] = i
            }
        }

        // Pop that one extra
        row_ptr.pop()

        return new CSRSparseMatrix(sparse_matrix, col_idx, row_ptr)
    }
}