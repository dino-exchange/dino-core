// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import './libraries/SafeBEP20.sol';
import './libraries/SafeMath.sol';
import './libraries/Ownable.sol';
import './libraries/Pausable.sol';
import './interfaces/IBEP20.sol';

contract DinoLuckyWheel is Ownable, Pausable {
    using SafeBEP20 for IBEP20;
    using SafeMath for uint256;

    uint256 public turnPrice = 5 * 10**18; // 5 DINO
    IBEP20 public token; // DINO token
    uint256 private value;

    event Spin(address indexed user, uint256 reward);
    event Pause();
    event Unpause();

    /**
     * @notice Checks if the msg.sender is a contract or a proxy
     */
    modifier notContract() {
        require(!_isContract(msg.sender), 'contract not allowed');
        require(msg.sender == tx.origin, 'proxy contract not allowed');
        _;
    }

    /**
     * @notice Constructor
     * @param _token: Dino token contract
     */
    constructor(IBEP20 _token) public {
        token = _token;
    }

    function randomReward() internal returns (uint256) {
        uint256 e = address(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c).balance;
        value = uint256(keccak256(abi.encodePacked(e, block.timestamp, value, block.coinbase, msg.sender))) % 10000;
        if (value < 5) return 500;
        if (value < 405) return 20;
        if (value < 1205) return 15;
        if (value < 3505) return 10;
        return 0;
    }

    function spin() external whenNotPaused notContract returns (uint256) {
        require(tx.gasprice <= 10 gwei, "Gas price too high");
        token.safeTransferFrom(msg.sender, address(this), turnPrice);
        uint256 amount = randomReward() * 10**18;
        if (amount > 0) {
            token.safeTransfer(msg.sender, amount);
        }
        emit Spin(msg.sender, amount);
    }

    function setTurnPrice(uint256 _turnPrice) external onlyOwner {
        require(_turnPrice > 0, 'turnPrice cannot be ZERO');
        turnPrice = _turnPrice;
    }

    /**
     * @notice Withdraw tokens from Lucky Wheel
     */
    function withdraw(address _token, uint256 _amount) external onlyOwner {
        IBEP20(_token).safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice Triggers stopped state
     * @dev Only possible when contract not paused.
     */
    function pause() external onlyOwner whenNotPaused {
        _pause();
        emit Pause();
    }

    /**
     * @notice Returns to normal state
     * @dev Only possible when contract is paused.
     */
    function unpause() external onlyOwner whenPaused {
        _unpause();
        emit Unpause();
    }

    /**
     * @notice Checks if address is a contract
     * @dev It prevents contract from being targetted
     */
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
