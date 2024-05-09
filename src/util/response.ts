export default {
    ok: (data: any) => {
        return {
            success: true,
            data
        }
    },
    error: (data: any) => {
        return {
            success: false,
            data
        }
    }
}