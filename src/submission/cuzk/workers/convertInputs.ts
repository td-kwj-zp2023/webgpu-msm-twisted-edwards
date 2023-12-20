import { expose } from 'threads/worker';
import { convert_inputs_to_bytes } from '../convert_inputs_to_bytes'
expose(convert_inputs_to_bytes)
